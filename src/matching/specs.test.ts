import { expect, test } from "bun:test";

import { normalizeSpec, readGenericSpecs, specMatches } from "./specs.ts";

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

test("a memory value is not the storage", () => {
  expect(readGenericSpecs("MacBook Pro 16GB RAM 1TB").specs.storage).toBe(
    "1tb",
  );
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

test("GB and TB values stay distinct", () => {
  expect(
    specMatches("storage", "1tb", normalizeSpec("storage", "1024GB")),
  ).toBe(false);
});

test("a color matches a longer catalogue color, and a blank value matches anything", () => {
  expect(specMatches("color", "black", "space black")).toBe(true);
  expect(specMatches("color", "black", "blue")).toBe(false);
  expect(specMatches("storage", "128gb", undefined)).toBe(true);
});

test("cellular alone matches each connectivity with cellular", () => {
  expect(specMatches("connectivity", "cellular", "gps+cellular")).toBe(true);
  expect(specMatches("connectivity", "cellular", "wifi")).toBe(false);
  expect(specMatches("connectivity", "wifi", "wifi+cellular")).toBe(false);
});
