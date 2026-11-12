import { expect, test } from "bun:test";

import { normalizeSpec, readGenericSpecs } from "./specs.ts";

test("reads storage, condition, size, year, generation, and connectivity apart from the model", () => {
  const { specs, rest } = readGenericSpecs(
    "Used iPad Air 7th Gen (13-inch) 2025 256GB WiFi + Cellular",
  );
  expect(specs).toEqual({
    storage: "256gb",
    size: '13"',
    year: "2025",
    generation: "7",
    condition: "used",
    connectivity: "wifi+cellular",
  });
  expect(rest.replace(/\W+/g, " ").trim()).toBe("iPad Air");
});

test("with no RAM word, the larger of two GB or TB values is the storage", () => {
  expect(readGenericSpecs("MacBook Pro 16GB 1TB").specs.storage).toBe("1tb");
});

test.each([
  ["refurbished iPhone", "used"],
  ["pre-owned iPhone", "used"],
  ["second-hand iPhone", "used"],
  ["brand new iPhone", "new"],
])("%s has condition %s", (text, condition) => {
  expect(readGenericSpecs(text).specs.condition).toBe(condition);
});

test.each([
  ["GPS cellular", "gps+cellular"],
  ["WiFi+Cellular", "wifi+cellular"],
  ["Wi-Fi", "wifi"],
  ["LTE", "cellular"],
  ["5G", "cellular"],
])("connectivity %s reads as %s", (text, connectivity) => {
  expect(readGenericSpecs(`iPad ${text}`).specs.connectivity).toBe(
    connectivity,
  );
});

test("sizes in inches and millimetres have one compared form", () => {
  expect(normalizeSpec("size", '10.9"')).toBe('10.9"');
  expect(normalizeSpec("size", "11")).toBe('11"');
  expect(normalizeSpec("size", "42MM")).toBe("42mm");
  expect(normalizeSpec("generation", "5th")).toBe("5");
  expect(normalizeSpec("color", " Space  Black ")).toBe("space black");
  expect(normalizeSpec("color", "")).toBeUndefined();
});
