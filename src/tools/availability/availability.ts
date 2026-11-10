import { readFileSync } from "node:fs";

import { z } from "zod";

import { parseEnv } from "../../env.ts";
import { parseQuery } from "../../matching/query.ts";
import type { Source } from "../../sources/source.ts";
import {
  reply,
  requestText,
  type ToolContext,
  type ToolFactory,
} from "../tool.ts";
import { parseStockMappings, prepareStock } from "./prepare.ts";
import { presentDevice } from "./present.ts";
import { type Budget, type Order, searchStock } from "./search.ts";
import { parseStockFeed, type StockRow } from "./stock.ts";

const settings = z
  .object({
    STOCK_FEED_KEY: z.string().min(1),
    STOCK_EXPORT_KEY: z.string().min(1).optional(),
    STOCK_FEED_MAPPINGS_FILE: z.string().min(1).optional(),
  })
  .refine((env) => !env.STOCK_EXPORT_KEY || env.STOCK_FEED_MAPPINGS_FILE, {
    error: "STOCK_FEED_MAPPINGS_FILE is required with STOCK_EXPORT_KEY",
  });

const bound = z.number().int().nonnegative();
const input = {
  model: requestText()
    .optional()
    .describe(
      'Device description, for example "Used iPhone 14 Black 128GB" or "iPhone". Omit it to search all devices.',
    ),
  promotion_only: z
    .boolean()
    .default(false)
    .describe("Only devices with a promotion price."),
  budget: z
    .object({ min: bound, max: bound })
    .refine((b) => b.min < b.max, "budget.min must be less than budget.max")
    .optional()
    .describe("Price range in whole currency units. Both bounds are included."),
  sort_order: z.enum(["desc", "asc"]).default("desc").describe("Price order."),
};

type Request = {
  model?: string;
  promotion_only: boolean;
  budget?: Budget;
  sort_order: Order;
};

async function check(
  stock: Source<StockRow[]>,
  currency: string,
  request: Request,
) {
  const parsed = request.model?.trim() ? parseQuery(request.model) : {};
  if (!parsed)
    return reply(
      "The device is not recognized. Ask for a different description.",
    );
  const { modelNumber: _, ...filters } = parsed;
  const result = searchStock(
    await stock.get(),
    {
      ...filters,
      promotionOnly: request.promotion_only,
      budget: request.budget,
    },
    request.sort_order,
  );
  if (result.outcome === "not_in_catalogue")
    return reply("The catalogue has no devices of this category.");
  if (result.outcome === "no_match")
    return reply("No devices match the request.");
  const adjustments = {
    ...(result.dropped.length ? { dropped_preferences: result.dropped } : {}),
    ...(result.substitution ? { model_substitution: result.substitution } : {}),
  };
  return reply({
    devices: result.devices.map((row) => presentDevice(row, currency)),
    ...(Object.keys(adjustments).length ? { adjustments } : {}),
  });
}

function stockPreparation(
  context: ToolContext,
  exportKey: string,
  feedKey: string,
  mappingsFile: string,
) {
  const mappings = parseStockMappings(
    JSON.parse(readFileSync(mappingsFile, "utf8")),
  );
  return context.preparation("stock", async () => {
    const rows = prepareStock(await context.storage.read(exportKey), mappings);
    await context.storage.write(feedKey, JSON.stringify(rows));
  });
}

export const availability: ToolFactory = (context) => {
  const env = parseEnv(settings, context.env);
  const stock = context.source("stock", env.STOCK_FEED_KEY, parseStockFeed);
  const exportKey = env.STOCK_EXPORT_KEY;
  const mappingsFile = env.STOCK_FEED_MAPPINGS_FILE;
  return {
    sources: [stock],
    preparations:
      exportKey && mappingsFile
        ? [
            stockPreparation(
              context,
              exportKey,
              env.STOCK_FEED_KEY,
              mappingsFile,
            ),
          ]
        : [],
    register(server) {
      server.registerTool(
        "check_availability",
        {
          description:
            "Find devices in stock with their prices and stores. Returns at most 10 devices. When no device matches exactly, the search removes preferences or offers a newer or older model, and reports it in adjustments.",
          inputSchema: input,
        },
        (request) => check(stock, context.market.currency, request),
      );
    },
  };
};
