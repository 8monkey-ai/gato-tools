import { expect, test } from "bun:test";

import { stockCsv, stockRow } from "../fixtures.ts";
import { sampleFiles, useService } from "../harness.ts";
import { check, models } from "./check.ts";

const service = useService(async () => ({
  market: "MY",
  files: {
    ...(await sampleFiles()),
    "Stock.csv": stockCsv([
      stockRow({
        Model: "Used iPhone 14 128GB Blue",
        Color: "Blue",
        Storage: "128GB",
      }),
      stockRow({
        Model: "Used iPhone 16 Pro 256GB Natural Titanium",
        Color: "Natural Titanium",
        Storage: "256GB",
      }),
      stockRow({
        Model: "Used iPhone 16 Pro 256GB Black Titanium",
        Color: "Black Titanium",
        Storage: "256GB",
        "Case Material": "Titanium",
      }),
      stockRow({
        Model: "Used iPhone 15 Pro 128GB Space Black",
        Color: "Space Black",
        Storage: "128GB",
      }),
      stockRow({
        Category: "U_MAC",
        Model: "Used MacBook Pro 1024GB",
        Storage: "1024GB",
      }),
    ]),
  },
}));

test("§2 exact Stock Present matches return with no relaxation and no substitution", async () => {
  const result = await check(service(), { model: "Used iPhone 14 128GB Blue" });
  expect(models(result)).toEqual(["Used iPhone 14 128GB Blue"]);
  expect(result.adjustments).toBeUndefined();
});

test("§2 condition and color removal find nothing, so the report names storage only", async () => {
  const result = await check(service(), { model: "New iPhone 14 Black 512GB" });
  expect(models(result)).toEqual(["Used iPhone 14 128GB Blue"]);
  expect(result.adjustments).toEqual({ dropped_filters: ["storage"] });
});

test("§2 Natural Titanium is a color, not a material", async () => {
  const result = await check(service(), {
    model: "iPhone 16 Pro Natural Titanium",
  });
  expect(models(result)).toEqual(["Used iPhone 16 Pro 256GB Natural Titanium"]);
  expect(result.adjustments).toBeUndefined();
});

test("§2 Black matches Space Black", async () => {
  const result = await check(service(), { model: "iPhone 15 Pro Black" });
  expect(models(result)).toEqual(["Used iPhone 15 Pro 128GB Space Black"]);
  expect(result.adjustments).toBeUndefined();
});

test("§2 a 1TB request does not match a 1024GB row", async () => {
  const result = await check(service(), { model: "MacBook Pro 1TB" });
  expect(result.adjustments).toEqual({ dropped_filters: ["storage"] });
});
