import { expect, test } from "bun:test";

import { parseQuery } from "./query.ts";

test.each([
  [
    "Used iPhone 12 Black 128GB",
    {
      category: "iPhone",
      model: "iPhone 12",
      condition: "Used",
      color: "Black",
      storage: "128GB",
    },
  ],
  ["iPad Air 5", { category: "iPad", model: "iPad Air", generation: "5th" }],
  ["iPad Pro 11", { category: "iPad", model: "iPad Pro", size: '11"' }],
  ["iPad Air 12.9", { category: "iPad", model: "iPad Air", size: '12.9"' }],
  [
    "iPhone 15 Pro Natural Titanium 256GB",
    {
      category: "iPhone",
      model: "iPhone 15 Pro",
      color: "Natural Titanium",
      storage: "256GB",
    },
  ],
  [
    "Apple Watch Series 9 45mm GPS Aluminum",
    {
      category: "Apple Watch",
      model: "Apple Watch Series 9",
      size: "45MM",
      connectivity: "GPS",
      material: "Aluminium",
    },
  ],
  [
    "MacBook Air 13-inch M2 512GB",
    {
      category: "Mac",
      model: "MacBook Air",
      size: '13"',
      chipset: "M2",
      storage: "512GB",
    },
  ],
  [
    "MacBook Pro M4 Max 2024",
    {
      category: "Mac",
      model: "MacBook Pro",
      chipset: "M4 MAX",
      year: "2024",
    },
  ],
  [
    "MacBook Pro 16GB RAM 1TB",
    { category: "Mac", model: "MacBook Pro 16GB RAM", storage: "1TB" },
  ],
  [
    "iPad Pro 11-inch 5th gen WiFi+Cellular",
    {
      category: "iPad",
      model: "iPad Pro",
      size: '11"',
      generation: "5th",
      connectivity: "WiFi+Cellular",
    },
  ],
  [
    "iPad mini LTE",
    { category: "iPad", model: "iPad mini", connectivity: "WiFi+Cellular" },
  ],
  [
    "Apple Watch Ultra 2 cellular",
    {
      category: "Apple Watch",
      model: "Apple Watch Ultra 2",
      connectivity: "GPS+Cellular",
    },
  ],
  [
    "Refurbished iPhone 13",
    { category: "iPhone", model: "iPhone 13", condition: "Used" },
  ],
  [
    "pre-owned iPhone 13",
    { category: "iPhone", model: "iPhone 13", condition: "Used" },
  ],
  [
    "second hand iPhone 13",
    { category: "iPhone", model: "iPhone 13", condition: "Used" },
  ],
  [
    "Samsung Galaxy A15 128GB",
    { category: "Samsung", model: "Samsung Galaxy A15", storage: "128GB" },
  ],
  ["Galaxy", { category: "Samsung", model: undefined }],
  ["iPhone", { category: "iPhone", model: undefined }],
  ["PS5 Slim", { category: "PlayStation", model: "PS5 Slim" }],
])("%s", (text, expected) => {
  expect(parseQuery(text)).toMatchObject(expected);
});

test("Natural Titanium is a color and adds no material", () => {
  expect(
    parseQuery("iPhone 16 Pro Natural Titanium")?.material,
  ).toBeUndefined();
  expect(parseQuery("Apple Watch Series 9 titanium")?.material).toBe(
    "Titanium",
  );
});

test("a model number alone gives only the model number", () => {
  expect(parseQuery("a2172")).toEqual({ modelNumber: "A2172" });
  expect(parseQuery("iPhone 12 A2172")).toMatchObject({
    model: "iPhone 12",
    modelNumber: "A2172",
  });
});

test("text without a category or model number is not recognized", () => {
  expect(parseQuery("asdfghjkl random junk")).toBeUndefined();
  expect(parseQuery("   ")).toBeUndefined();
});

test("GB and TB stay distinct", () => {
  expect(parseQuery("iPhone 15 1TB")?.storage).toBe("1TB");
});
