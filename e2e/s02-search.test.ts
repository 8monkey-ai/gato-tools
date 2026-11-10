import { expect, test } from "bun:test";

import { device } from "./support/data.ts";
import { models, prices, search } from "./support/search.ts";

const priced = (...retail: string[]) =>
  retail.map((retailPrice) => device({ retailPrice }));

test("§2 budget bounds are inclusive", async () => {
  const answer = await search(priced("999", "1000", "2000", "2001"), {
    budget: { min: 1000, max: 2000 },
  });
  expect(prices(answer)).toEqual(["RM 2000", "RM 1000"]);
  expect(answer.json().adjustments).toBeUndefined();
});

test("§2 relaxation widens the budget by 250, then by 250 again, then removes it", async () => {
  const budget = { min: 1000, max: 2000 };
  const first = await search(priced("2250", "2500", "3000"), { budget });
  expect(prices(first)).toEqual(["RM 2250"]);
  expect(first.json().adjustments).toEqual({ dropped_preferences: ["budget"] });
  expect(
    prices(await search(priced("2251", "2500", "3000"), { budget })),
  ).toEqual(["RM 2500", "RM 2251"]);
  expect(prices(await search(priced("2501", "3000"), { budget }))).toEqual([
    "RM 3000",
    "RM 2501",
  ]);
});

test("§2 budget 100 to 300 widens to 0 to 550, then 0 to 800", async () => {
  const budget = { min: 100, max: 300 };
  expect(prices(await search(priced("0", "551"), { budget }))).toEqual([
    "RM 0",
  ]);
  expect(prices(await search(priced("551", "800", "801"), { budget }))).toEqual(
    ["RM 800", "RM 551"],
  );
});

test("§2 when promotion-only removal finds results after the budget relaxation, the report names both", async () => {
  const answer = await search(priced("5000"), {
    promotion_only: true,
    budget: { min: 1000, max: 2000 },
  });
  expect(prices(answer)).toEqual(["RM 5000"]);
  expect(answer.json().adjustments).toEqual({
    dropped_preferences: ["budget", "promotion_only"],
  });
});

test.each([
  [{ min: 1000.5, max: 2000 }],
  [{ min: -1, max: 2000 }],
  [{ min: 2000, max: 1000 }],
])("§2 budget bounds %p are rejected", async (budget) => {
  const answer = await search(priced("1500"), { budget });
  expect(answer.isError).toBe(true);
  expect(answer.text).toContain("budget");
});

test("§2 a decimal retail price without a promotion sorts by that price, but a budget excludes it", async () => {
  const rows = priced("1999.50", "2500", "1999");
  expect(prices(await search(rows, {}))).toEqual([
    "RM 2500",
    "RM 1999.50",
    "RM 1999",
  ]);
  expect(
    prices(await search(rows, { budget: { min: 1000, max: 3000 } })),
  ).toEqual(["RM 2500", "RM 1999"]);
});

test("§2 the promotion price decides the budget and the order where available", async () => {
  const rows = [
    device({ retailPrice: "3000", promotionPrice: "1200" }),
    device({ retailPrice: "1500" }),
  ];
  expect(prices(await search(rows, {}))).toEqual(["RM 1500", "RM 3000"]);
  expect(
    prices(await search(rows, { budget: { min: 1000, max: 1300 } })),
  ).toEqual(["RM 3000"]);
});

test("§2 promotion only excludes a device with no promotion price, and an ordinary search includes it", async () => {
  const rows = [
    device({ retailPrice: "2000", promotionPrice: "1800" }),
    device(),
  ];
  expect(prices(await search(rows, { promotion_only: true }))).toEqual([
    "RM 2000",
  ]);
  expect(prices(await search(rows, {}))).toEqual(["RM 2000", "RM 1500"]);
});

test("§2 when all matches are out of stock, the immediately newer model comes before the older one", async () => {
  const twelve = device({ model: "iPhone 12", availability: "Out of Stock" });
  const newer = device({ model: "iPhone 13", availability: "Low Stock" });
  const older = device({ model: "iPhone 11" });
  const both = await search([twelve, older, newer], {
    model: "iPhone 12 Black 128GB",
  });
  expect(models(both)).toEqual(["iPhone 13"]);
  expect(both.json().adjustments).toEqual({ model_substitution: "newer" });

  const olderOnly = await search([twelve, older], {
    model: "iPhone 12 Black 128GB",
  });
  expect(models(olderOnly)).toEqual(["iPhone 11"]);
  expect(olderOnly.json().adjustments).toEqual({ model_substitution: "older" });

  const neither = await search([twelve, device({ model: "iPhone 14" })], {
    model: "iPhone 12",
  });
  expect(neither.json().devices).toMatchObject([
    { model: "iPhone 12", availability: "Out of Stock" },
  ]);
  expect(neither.json().adjustments).toBeUndefined();
});

test("§2 a substitute uses the same relaxation, and the report names its removals", async () => {
  const answer = await search(
    [
      device({ model: "iPhone 12", availability: "Out of Stock" }),
      device({ model: "iPhone 13", color: "White" }),
    ],
    { model: "iPhone 12 Black" },
  );
  expect(models(answer)).toEqual(["iPhone 13"]);
  expect(answer.json().adjustments).toEqual({
    dropped_preferences: ["color"],
    model_substitution: "newer",
  });
});

test("§2 twelve matches give ten devices, highest price first by default and lowest first on request", async () => {
  const rows = priced(
    ...Array.from({ length: 12 }, (_, i) => String(1000 + i * 100)),
  );
  const highest = await search(rows, { model: "iPhone 12" });
  expect(prices(highest)).toEqual(
    [
      "2100",
      "2000",
      "1900",
      "1800",
      "1700",
      "1600",
      "1500",
      "1400",
      "1300",
      "1200",
    ].map((p) => `RM ${p}`),
  );
  const lowest = await search(rows, { model: "iPhone 12", sort_order: "asc" });
  expect(prices(lowest)).toEqual(
    [
      "1000",
      "1100",
      "1200",
      "1300",
      "1400",
      "1500",
      "1600",
      "1700",
      "1800",
      "1900",
    ].map((p) => `RM ${p}`),
  );
});

test("§2 equal prices keep the catalogue order", async () => {
  const rows = [
    device({ model: "iPhone 12", color: "Black" }),
    device({ model: "iPhone 12", color: "Blue" }),
  ];
  const colors = (answer: Awaited<ReturnType<typeof search>>) =>
    answer.json().devices.map((d) => d.color);
  expect(colors(await search(rows, {}))).toEqual(["Black", "Blue"]);
  expect(colors(await search(rows, { sort_order: "asc" }))).toEqual([
    "Black",
    "Blue",
  ]);
});
