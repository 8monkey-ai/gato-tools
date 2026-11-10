import { z } from "zod";

import { parseEnv } from "../../env.ts";
import type { Source } from "../../sources/source.ts";
import {
  reply,
  requestText,
  type ToolContext,
  type ToolFactory,
} from "../tool.ts";
import { prepareTradeIn } from "./prepare.ts";
import { parseReference, type Variant, variantSpecs } from "./reference.ts";
import { valueDevice } from "./valuation.ts";

const settings = z
  .object({
    TRADE_IN_REFERENCE_KEY: z.string().min(1),
    TRADE_IN_EXPORT_KEY: z.string().min(1).optional(),
    TRADE_IN_FEED_KEY: z.string().min(1).optional(),
  })
  .refine((env) => !env.TRADE_IN_EXPORT_KEY || env.TRADE_IN_FEED_KEY, {
    error: "TRADE_IN_FEED_KEY is required with TRADE_IN_EXPORT_KEY",
  })
  .refine((env) => env.TRADE_IN_FEED_KEY !== env.TRADE_IN_REFERENCE_KEY, {
    error: "TRADE_IN_FEED_KEY must differ from TRADE_IN_REFERENCE_KEY",
  });

const messages = {
  not_recognized:
    "The device is not recognized. Ask for a different description.",
  empty_reference: "The trade-in reference has no devices.",
  unsupported_category: "Trade-in is not offered for this category.",
  no_match: "No trade-in variant matches the request.",
  too_broad:
    "More than 10 variants match. Ask for a narrower description, for example with storage or size.",
};

function present(variant: Variant, currency: string) {
  const entry: Record<string, string> = { model: variant.model };
  for (const key of variantSpecs) if (variant[key]) entry[key] = variant[key];
  entry.value = variant.value && `${currency} ${variant.value}`;
  return entry;
}

function preparation(
  context: ToolContext,
  exportKey?: string,
  feedKey?: string,
) {
  if (!exportKey || !feedKey) return [];
  return [
    context.preparation("trade-in", async () => {
      const feed = prepareTradeIn(await context.storage.read(exportKey));
      await context.storage.write(feedKey, feed);
    }),
  ];
}

async function check(
  reference: Source<Variant[]>,
  currency: string,
  model: string,
) {
  const result = valueDevice(await reference.get(), model);
  if (result.outcome !== "found") return reply(messages[result.outcome]);
  return reply({
    devices: result.variants.map((v) => present(v, currency)),
    note: "Catalogue values. The final offer depends on an inspection of the device.",
  });
}

export const tradeIn: ToolFactory = (context) => {
  if (context.market.code !== "MY") return undefined;
  const env = parseEnv(settings, context.env);
  const reference = context.source(
    "trade-in",
    env.TRADE_IN_REFERENCE_KEY,
    parseReference,
  );
  return {
    sources: [reference],
    preparations: preparation(
      context,
      env.TRADE_IN_EXPORT_KEY,
      env.TRADE_IN_FEED_KEY,
    ),
    register(server) {
      server.registerTool(
        "check_sale_or_trade_in_value",
        {
          description:
            "Find the catalogue trade-in value of a device by description or Apple model number (for example A2172). The value is a catalogue value, not a binding offer: the store inspects the device. Color, condition, battery, and screen do not change the value.",
          inputSchema: {
            model: requestText().describe(
              'Device description, for example "iPhone 14 Pro 256GB", or a model number.',
            ),
          },
        },
        ({ model }) => check(reference, context.market.currency, model),
      );
    },
  };
};
