import { z } from "zod";

const text = z.string().default("");

const stockRow = z.object({
  category: z.string(),
  model: z.string(),
  condition: z.string(),
  availability: z.string(),
  color: text,
  storage: text,
  size: text,
  chipset: text,
  connectivity: text,
  material: text,
  generation: text,
  year: text,
  ram: text,
  retailPrice: text,
  promotionPrice: text,
  lastMonthPrice: text,
  otherPrices: z
    .array(
      z.object({ name: z.string(), amount: z.string(), monthly: z.boolean() }),
    )
    .default([]),
  checkoutLink: text,
  videoLinks: z.array(z.string()).default([]),
  stores: z.array(z.string()).default([]),
});

export type StockRow = z.infer<typeof stockRow>;

export const parseStockFeed = (feed: string): StockRow[] =>
  z.array(stockRow).parse(JSON.parse(feed.trim() || "[]"));
