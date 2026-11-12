import { z } from "zod";

import { formatAmount, type Market } from "../../market.ts";
import { readDescription } from "../../matching/catalogue.ts";
import { defineTool, maxTextLength, type Tool } from "../tool.ts";
import { searchStock, type StockMatch, type StockRequest } from "./search.ts";
import { readStock } from "./stock.ts";

const description = `Finds devices in stock, with availability and prices.
Use the full product name in model, for example "Used iPhone 12 128GB Black" or "Samsung Galaxy S25 Ultra".
When no exact available match exists, the result can drop preferences (adjustments.dropped_filters) or offer the immediately newer or older model (adjustments.model_substitution).
Prices are in the market currency. "Online Only" means that no store has the device.`;

const inputSchema = {
  model: z
    .string()
    .max(maxTextLength)
    .optional()
    .describe("Device description"),
  in_promo: z
    .boolean()
    .optional()
    .describe("Only devices with a promotion price"),
  price_range: z
    .string()
    .max(maxTextLength)
    .refine(
      (text) => readBudget(text),
      "price_range must be two increasing whole numbers, for example 1000-2000",
    )
    .optional()
    .describe('Budget, for example "1000-2000"'),
  sort_order: z
    .enum(["desc", "asc"])
    .optional()
    .describe("Price order, desc by default"),
};

export const availabilityTool: Tool = {
  name: "check_availability",
  markets: ["MY", "PH"],
  setup({ market, watch }) {
    const stock = watch({
      name: "stock",
      file: "Stock.csv",
      label: "Stock",
      parse: readStock,
    });
    return defineTool({
      description,
      inputSchema,
      handle(input) {
        const catalogue = stock.current();
        const text = input.model?.trim();
        const query = text ? readDescription(catalogue, text) : undefined;
        if (text && !query)
          return {
            devices: [],
            message: `The device is not recognized. Known categories: ${catalogue.categories.join(", ")}. Ask for the full product name.`,
          };
        const request: StockRequest = {
          query,
          inPromo: input.in_promo ?? false,
          budget: input.price_range ? readBudget(input.price_range) : undefined,
          order: input.sort_order ?? "desc",
        };
        const result = searchStock(catalogue, request);
        if (!result)
          return {
            devices: [],
            message:
              "No device matches the request. Offer other models or preferences.",
          };
        return {
          devices: result.items.map((item) => formatDevice(market, item)),
          ...adjustments(result),
        };
      },
    });
  },
};

function readBudget(text: string): [number, number] | undefined {
  const [, low, high] = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(text) ?? [];
  return low && high && Number(low) < Number(high)
    ? [Number(low), Number(high)]
    : undefined;
}

function adjustments({
  droppedFilters,
  substitution,
}: {
  droppedFilters: string[];
  substitution?: string;
}) {
  if (!droppedFilters.length && !substitution) return {};
  return {
    adjustments: {
      ...(droppedFilters.length && { dropped_filters: droppedFilters }),
      ...(substitution && { model_substitution: substitution }),
    },
  };
}

function formatDevice(
  market: Market,
  { row, availability, stores, videos, checkoutLink }: StockMatch,
) {
  const amount = (value: string | undefined) =>
    value ? formatAmount(market, value) : undefined;
  const inStock = availability !== "No Stock";
  return {
    model: row.Model,
    condition: row.Condition || undefined,
    color: row.Color || undefined,
    storage: row.Storage || undefined,
    chipset: row.Chipset || undefined,
    generation: row.Generation || undefined,
    size: row.Size || undefined,
    material: row.CaseMaterial || undefined,
    availability,
    available_stores: inStock ? stores.join(", ") || "Online Only" : undefined,
    retail_price: amount(row.RetailPrice),
    promotion_price: amount(row.PromotionPrice),
    last_month_price: amount(row.LastMonthPrice),
    xox_bundle_price: amount(row.XOXBundlePrice),
    checkout_link: checkoutLink,
    video_link: videos[Math.floor(Math.random() * videos.length)],
  };
}
