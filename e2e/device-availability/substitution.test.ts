import { expect, test } from "bun:test";

import { stockCsv, stockRow } from "../fixtures.ts";
import { sampleFiles, useService } from "../harness.ts";
import { check, models } from "./check.ts";

const row = (model: string, availability: string, category = "U_IPHONE") =>
  stockRow({
    Model: model,
    Category: category,
    "No stock at all": availability,
  });

const service = useService(async () => ({
  market: "MY",
  files: {
    ...(await sampleFiles()),
    "Stock.csv": stockCsv([
      row("Used iPhone 12 128GB", "No Stock"),
      row("Used iPhone 13 128GB", "Low Stock"),
      row("Used iPhone 11 128GB", "Stock Present"),
      row("Used iPhone 17 256GB", "Stock Present"),
      row("Used iPhone 15 256GB", "Stock Present"),
      row("Used iPhone 8 64GB", "No Stock"),
      row("Used Samsung Galaxy S25 Ultra 256GB", "No Stock", "U_SAMSUNG"),
      row("Used Samsung Galaxy S24 Ultra 256GB", "Stock Present", "U_SAMSUNG"),
      row("Used Google Pixel 21 128GB", "No Stock", "U_PIXEL"),
      row("Used Google Pixel 19 128GB", "No Stock", "U_PIXEL"),
      row("Used iPhone 14 128GB", "Stock Present"),
      row("Used iPhone 14 512GB", "Discontinued"),
      row("Used iPhone 3 16GB", "Low Stock"),
      row("Used iPhone 3 32GB", "No Stock"),
    ]),
  },
}));

test("§2 when all matches are No Stock, the newer model comes before the older one", async () => {
  const result = await check(service(), { model: "iPhone 12" });
  expect(models(result)).toEqual(["Used iPhone 13 128GB"]);
  expect(result.adjustments).toEqual({ model_substitution: "newer" });
});

test("§2 the older model is tried when no newer model is in stock", async () => {
  const result = await check(service(), { model: "Samsung Galaxy S25 Ultra" });
  expect(models(result)).toEqual(["Used Samsung Galaxy S24 Ultra 256GB"]);
  expect(result.adjustments).toEqual({ model_substitution: "older" });
});

test("§2 when neither neighbor works, the original No Stock matches remain with no stores", async () => {
  const result = await check(service(), { model: "iPhone 8" });
  expect(result.devices).toHaveLength(1);
  expect(result.devices[0]).toMatchObject({
    model: "Used iPhone 8 64GB",
    availability: "No Stock",
  });
  expect(result.devices[0]?.available_stores).toBeUndefined();
  expect(result.adjustments).toBeUndefined();
});

test("§2 with no iPhone 16 and iPhone 17 in stock, iPhone 17 is a newer substitution", async () => {
  const result = await check(service(), { model: "iPhone 16" });
  expect(models(result)).toEqual(["Used iPhone 17 256GB"]);
  expect(result.adjustments).toEqual({ model_substitution: "newer" });
});

test("§2 with no match and no neighbor in stock, the result is the no-match outcome", async () => {
  expect(await check(service(), { model: "Google Pixel 20" })).toEqual({
    devices: [],
    message:
      "No device matches the request. Offer other models or preferences.",
  });
});

test("§2 when Stock Present or Low Stock matches exist, only those remain", async () => {
  expect(models(await check(service(), { model: "iPhone 3" }))).toEqual([
    "Used iPhone 3 16GB",
  ]);
});

test("§2 labels appear as the stock data gives them, and other labels do not appear", async () => {
  const result = await check(service(), { model: "iPhone 14 512GB" });
  expect(models(result)).toEqual(["Used iPhone 14 128GB"]);
  expect(result.devices[0]?.availability).toBe("Stock Present");
});
