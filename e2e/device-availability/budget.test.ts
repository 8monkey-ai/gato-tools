import { expect, test } from "bun:test";

import { stockCsv, stockRow } from "../fixtures.ts";
import { sampleFiles, useService } from "../harness.ts";
import { check, models } from "./check.ts";

const row = (model: string, color: string, retail: string, promotion = "") =>
  stockRow({
    Model: `Used ${model} ${color}`,
    Color: color,
    "Retail Price": retail,
    "Promotion Price": promotion,
  });

const service = useService(async () => ({
  market: "MY",
  files: {
    ...(await sampleFiles()),
    "Stock.csv": stockCsv([
      row("iPhone 15", "Red", "999"),
      row("iPhone 15", "Blue", "1000"),
      row("iPhone 15", "Green", "2500", "2000"),
      row("iPhone 15", "Gold", "2001"),
      row("iPhone 11", "Red", "2200"),
      row("iPhone 8", "Red", "2400"),
      row("iPhone 7", "Red", "3000"),
      row("iPhone 6", "Red", "500"),
      row("iPhone 5", "Red", "700"),
      row("iPhone 4", "Red", "5000"),
      row("iPhone 12", "Red", "1500"),
      row("iPhone 12", "Blue", "1999.50"),
      row("iPhone 12", "Green", "2500"),
      row("iPhone 13", "Red", "1500", "1400"),
      row("iPhone 13", "Blue", "1600"),
    ]),
  },
}));

test("§2 budget bounds are inclusive", async () => {
  const result = await check(service(), {
    model: "iPhone 15",
    price_range: "1000-2000",
    sort_order: "asc",
  });
  expect(models(result)).toEqual([
    "Used iPhone 15 Blue",
    "Used iPhone 15 Green",
  ]);
  expect(result.adjustments).toBeUndefined();
});

test("§2 the budget widens to 750-2250 first", async () => {
  const result = await check(service(), {
    model: "iPhone 11",
    price_range: "1000-2000",
  });
  expect(models(result)).toEqual(["Used iPhone 11 Red"]);
  expect(result.adjustments).toEqual({
    dropped_filters: ["price_range widened to 750-2250"],
  });
});

test("§2 the budget widens to 500-2500 second", async () => {
  const result = await check(service(), {
    model: "iPhone 8",
    price_range: "1000-2000",
  });
  expect(result.adjustments).toEqual({
    dropped_filters: ["price_range widened to 500-2500"],
  });
});

test("§2 the budget is removed after two widenings", async () => {
  const result = await check(service(), {
    model: "iPhone 7",
    price_range: "1000-2000",
  });
  expect(models(result)).toEqual(["Used iPhone 7 Red"]);
  expect(result.adjustments).toEqual({ dropped_filters: ["price_range"] });
});

test("§2 budget 100-300 widens to 0-550, then 0-800", async () => {
  const first = await check(service(), {
    model: "iPhone 6",
    price_range: "100-300",
  });
  expect(first.adjustments).toEqual({
    dropped_filters: ["price_range widened to 0-550"],
  });
  const second = await check(service(), {
    model: "iPhone 5",
    price_range: "100-300",
  });
  expect(second.adjustments).toEqual({
    dropped_filters: ["price_range widened to 0-800"],
  });
});

test("§2 promotion-only removal reports promotion only and the budget relaxation", async () => {
  const result = await check(service(), {
    model: "iPhone 4",
    price_range: "1000-2000",
    in_promo: true,
  });
  expect(models(result)).toEqual(["Used iPhone 4 Red"]);
  expect(result.adjustments).toEqual({
    dropped_filters: ["price_range", "in_promo"],
  });
});

test("§2 budget bounds 1000.50, -1, or 2000 to 1000 are rejected", async () => {
  for (const price_range of ["1000.50-2000", "-1-2000", "2000-1000"]) {
    const result = await check(service(), { model: "iPhone 12", price_range });
    expect(result.error).toContain(
      "price_range must be two increasing whole numbers",
    );
  }
});

test("§2 a decimal retail price sorts with no budget, and budget filtering excludes it", async () => {
  const open = await check(service(), {
    model: "iPhone 12",
    sort_order: "asc",
  });
  expect(models(open)).toEqual([
    "Used iPhone 12 Red",
    "Used iPhone 12 Blue",
    "Used iPhone 12 Green",
  ]);
  const budget = await check(service(), {
    model: "iPhone 12",
    price_range: "1000-3000",
    sort_order: "asc",
  });
  expect(models(budget)).toEqual([
    "Used iPhone 12 Red",
    "Used iPhone 12 Green",
  ]);
});

test("§2 promotion only excludes a device with no promotion price, and an ordinary search includes it", async () => {
  const promotion = await check(service(), {
    model: "iPhone 13",
    in_promo: true,
  });
  expect(models(promotion)).toEqual(["Used iPhone 13 Red"]);
  const ordinary = await check(service(), { model: "iPhone 13" });
  expect(models(ordinary)).toEqual([
    "Used iPhone 13 Blue",
    "Used iPhone 13 Red",
  ]);
});
