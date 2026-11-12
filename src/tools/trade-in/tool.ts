import { z } from "zod";

import { formatAmount, type Market } from "../../market.ts";
import { defineTool, maxTextLength, type Tool } from "../tool.ts";
import { readReference, specColumns } from "./reference.ts";
import { findVariants, type Match, newestFirst } from "./value.ts";

const description = `Finds the catalogue sale or trade-in value of a customer's device.
Use the full product name or an Apple model number in model, for example "iPhone 12 128GB" or "A2172".
The value is a catalogue value, not a binding offer: the store sets the final offer after it inspects the device.
Battery, screen, scratch, dent, color, and condition information does not change the value.`;

export const tradeInTool: Tool = {
  name: "check_sale_or_trade_in_value",
  markets: ["MY"],
  setup({ market, watch }) {
    const reference = watch({
      name: "trade-in",
      file: "Trade-in.csv",
      label: "Trade-in",
      parse: readReference,
    });
    return defineTool({
      description,
      inputSchema: {
        model: z
          .string()
          .max(maxTextLength)
          .describe("Device description or Apple model number"),
      },
      handle({ model }) {
        const catalogue = reference.current();
        if (!catalogue.groups.length)
          return {
            devices: [],
            message: "The trade-in reference has no devices.",
          };
        const variants = findVariants(catalogue, model);
        if (!variants)
          return {
            devices: [],
            message: `The device is not recognized. Trade-in categories: ${catalogue.categories.join(", ")}. Ask for the full product name.`,
          };
        if (!variants.length)
          return {
            devices: [],
            message:
              "No trade-in variant matches the request. Confirm the model and specifications.",
          };
        if (variants.length > 10)
          return {
            devices: [],
            message:
              "More than 10 variants match the request. Ask for more details, for example the storage or the year.",
          };
        return {
          devices: newestFirst(variants).map((variant) =>
            formatVariant(market, variant),
          ),
        };
      },
    });
  },
};

function formatVariant(market: Market, { row, price }: Match) {
  const specs = Object.fromEntries(
    specColumns.map(([name, column]) => [name, row[column] || undefined]),
  );
  return {
    model: row.Model,
    ...specs,
    trade_in_price:
      price === undefined ? undefined : formatAmount(market, price),
  };
}
