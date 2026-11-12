import { expect, test } from "bun:test";

import { promotions, useCampaigns } from "./offers.ts";

const service = useCampaigns(() => [
  { name: "Stackable", stackable: true, priority: 0, discount_value: 900 },
  { name: "Fixed 200", stackable: false, priority: 1, discount_value: 200 },
  {
    name: "Percent 10",
    stackable: false,
    priority: 1,
    discount_type: "percentage",
    discount_value: 10,
  },
  { name: "Priority 2", stackable: false, priority: 2, discount_value: 999 },
]);

const atAmount2000 = () =>
  promotions(service(), { purchase_amount: 2000, purchase_date: "2026-05-01" });

test("§4 offers that cannot be combined come first, then priority, then higher savings", async () => {
  const result = await atAmount2000();
  expect(result.promotions.map((offer) => offer.name)).toEqual([
    "Percent 10",
    "Fixed 200",
    "Priority 2",
    "Stackable",
  ]);
  expect(result.promotions[0]?.discount).toBe("10%");
});

test("§4 two offers that cannot be combined both appear and are not combinable", async () => {
  const result = await atAmount2000();
  expect(
    result.promotions.map((offer) => [offer.name, offer.stackable]),
  ).toEqual([
    ["Percent 10", false],
    ["Fixed 200", false],
    ["Priority 2", false],
    ["Stackable", true],
  ]);
});
