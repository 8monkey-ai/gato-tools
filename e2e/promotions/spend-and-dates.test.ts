import { expect, test } from "bun:test";

import { offerNames, promotions, useCampaigns } from "./offers.ts";

const service = useCampaigns(() => [
  { name: "Spend 3000", min_spend: 3000 },
  { name: "Spend 10499", min_spend: 10499 },
  { name: "Spend 10500", min_spend: 10500 },
  { name: "March", start_date: "2026-03-01", end_date: "2026-03-31" },
  {
    name: "Display",
    description: "Fixed amount with fractions",
    voucher_code: "SAVE150",
    discount_value: 150.75,
    min_spend: 2999.99,
    eligible_models: ["iPhone 15", "iPhone 15 Pro"],
    start_date: "2026-01-01",
  },
]);

const may = (args: Record<string, unknown> = {}) =>
  offerNames(service(), { purchase_date: "2026-05-01", ...args });

test("§4 for minimum spend 3000, amount 2500 includes the offer and amount 2499 does not", async () => {
  expect(await may({ purchase_amount: 2500 })).toContain("Spend 3000");
  expect(await may({ purchase_amount: 2499 })).not.toContain("Spend 3000");
});

test("§4 an omitted amount is evaluated as 9999", async () => {
  const names = await may();
  expect(names).toContain("Spend 10499");
  expect(names).not.toContain("Spend 10500");
});

test("§4 the tool description explains the allowance, and the result claims no eligibility", async () => {
  const response = await service().rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });
  const body = (await response.json()) as {
    result: { tools: { name: string; description: string }[] };
  };
  const tool = body.result.tools.find(
    (candidate) => candidate.name === "check_promotions",
  );
  expect(tool?.description).toContain(
    "does not mean that the customer qualifies at the actual spend",
  );
  const result = await promotions(service(), { purchase_date: "2026-05-01" });
  for (const offer of result.promotions)
    expect(Object.keys(offer)).not.toContain("eligible");
});

test("§4 campaign dates are inclusive and the result shows both dates", async () => {
  expect(
    await offerNames(service(), { purchase_date: "2026-03-01" }),
  ).toContain("March");
  expect(
    await offerNames(service(), { purchase_date: "2026-03-31" }),
  ).toContain("March");
  expect(
    await offerNames(service(), { purchase_date: "2026-04-01" }),
  ).not.toContain("March");
  const result = await promotions(service(), { purchase_date: "2026-03-15" });
  expect(
    result.promotions.find((offer) => offer.name === "March"),
  ).toMatchObject({
    start_date: "2026-03-01",
    end_date: "2026-03-31",
  });
});

test("§4 a fixed discount and a minimum spend show as whole units in the market currency", async () => {
  const result = await promotions(service(), { purchase_date: "2026-05-01" });
  expect(result.promotions.find((offer) => offer.name === "Display")).toEqual({
    name: "Display",
    description: "Fixed amount with fractions",
    voucher_code: "SAVE150",
    eligible_models: "iPhone 15, iPhone 15 Pro",
    start_date: "2026-01-01",
    stackable: true,
    priority: 1,
    discount: "RM 150",
    min_spend: "RM 2999",
  });
});
