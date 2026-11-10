import { expect, test } from "bun:test";

import { modelMatches, specsMatch } from "./model.ts";

test.each([
  ["iPhone 15", "iPhone 15", true],
  ["IPHONE 15", "iPhone 15", true],
  ["Used iPhone 15 yellow", "iPhone 15", true],
  ["Iphne 15", "iPhone 15", true],
  ["Samsung Galaxy Z Fold 7", "Samsung GALAXY Z FOLD7", true],
  ["iPhone 12", "iPhone 13", false],
  ["iPhone 15", "iPhone 15 Pro Max", false],
  ["iPhone 13", "iPhone 13 Pro", false],
  ["iPhone 14 Pro", "iPhone 13 Pro", false],
  ["iPhone 13 Pro", "iPhone 13 Pro Max", false],
  ["MacBook Air", "MacBook Pro", false],
  ["iPad Pro", "iPad Air", false],
  ["Apple Watch Series 9", "Apple Watch Series 10", false],
  ["iPad Air", "iPad Air 5", true],
  ["Samsung Galaxy Z Fold", "Samsung Galaxy Z Fold7", true],
  ["Samsung Galaxy Z Fold", "Samsung Galaxy Z Flip7", false],
  ["MacBook", "MacBook Air", true],
])("%s against %s gives %p", (request, catalogue, expected) => {
  expect(modelMatches(request, catalogue)).toBe(expected);
});

test("blank values do not exclude, and a color can match a longer color", () => {
  const keys = ["storage", "color"] as const;
  expect(specsMatch({ storage: "128GB" }, { storage: "" }, keys)).toBe(true);
  expect(specsMatch({ color: "Black" }, { color: "Space Black" }, keys)).toBe(
    true,
  );
  expect(specsMatch({ storage: "1TB" }, { storage: "1024GB" }, keys)).toBe(
    false,
  );
  expect(specsMatch({ storage: "128gb" }, { storage: "128GB" }, keys)).toBe(
    true,
  );
});
