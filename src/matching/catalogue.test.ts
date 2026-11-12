import { expect, test } from "bun:test";

import { buildCatalogue, readDescription } from "./catalogue.ts";

const catalogue = buildCatalogue([
  { category: "IPHONE", model: "iPhone 12", specs: { color: "black" } },
  { category: "IPHONE", model: "iPhone 13 Pro", specs: { chipset: "a15" } },
  {
    category: "IPAD",
    model: "iPad Air",
    specs: { generation: "5", size: '10.9"' },
  },
  {
    category: "IPAD",
    model: "iPad Pro",
    specs: { generation: "3", size: '11"' },
  },
  { category: "SAMSUNG", model: "Samsung Galaxy A15", specs: {} },
]);

test("a description that names only a category searches the whole category", () => {
  expect(readDescription(catalogue, "used iPhone")).toEqual({
    categories: ["IPHONE"],
    model: undefined,
    specs: { condition: "used" },
    modelNumber: undefined,
  });
});

test("a bare number after a model is a generation or a size of that model", () => {
  expect(readDescription(catalogue, "iPad Air 5")).toMatchObject({
    model: ["ipad", "air"],
    specs: { generation: "5" },
  });
  expect(readDescription(catalogue, "iPad Pro 11")).toMatchObject({
    model: ["ipad", "pro"],
    specs: { size: '11"' },
  });
});
