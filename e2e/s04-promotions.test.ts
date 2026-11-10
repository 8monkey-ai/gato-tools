import { expect, test } from "bun:test";

import { campaigns, offer } from "./support/data.ts";
import { openWorld } from "./support/search.ts";
import { keys } from "./support/world.ts";

async function promotions(
  offers: Record<string, unknown>[],
  args: Record<string, unknown>,
  env: Record<string, string> = {},
) {
  const world = openWorld();
  world.s3.objects.set(keys.campaigns, campaigns(...offers));
  const app = await world.start(env);
  return app.call("check_promotions", args);
}

const names = (answer: Awaited<ReturnType<typeof promotions>>) =>
  answer.text.startsWith("{")
    ? answer.json().promotions.map((p) => p.name)
    : ([] as unknown[]);

const zoneDate = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

test("§4 for minimum spend 3000, amount 2500 includes the offer and amount 2499 does not", async () => {
  const offers = [offer({ name: "Big", min_spend: 3000 })];
  expect(names(await promotions(offers, { purchase_amount: 2500 }))).toEqual([
    "Big",
  ]);
  expect((await promotions(offers, { purchase_amount: 2499 })).text).toBe(
    "No promotions apply to the request.",
  );
});

test("§4 an omitted amount is evaluated as 9999, and the result does not claim eligibility at the actual spend", async () => {
  const offers = [
    offer({ name: "Huge", min_spend: 10499 }),
    offer({ name: "Too big", min_spend: 10500 }),
  ];
  const answer = await promotions(offers, {});
  expect(names(answer)).toEqual(["Huge"]);
  expect(answer.json().note).toContain("can be below the minimum spend");
});

test("§4 campaign dates are inclusive, and the result shows them", async () => {
  const offers = [
    offer({ name: "March", start_date: "2025-03-01", end_date: "2025-03-31" }),
  ];
  const first = await promotions(offers, { purchase_date: "2025-03-01" });
  expect(first.json().promotions[0]).toMatchObject({
    start_date: "2025-03-01",
    end_date: "2025-03-31",
  });
  expect(
    names(await promotions(offers, { purchase_date: "2025-03-31" })),
  ).toEqual(["March"]);
  expect(
    names(await promotions(offers, { purchase_date: "2025-04-01" })),
  ).toEqual([]);
});

test("§4 an omitted date uses today in the configured timezone, and a change of market alone does not change it", async () => {
  const kiritimati = zoneDate("Pacific/Kiritimati");
  const offers = [
    offer({ name: "Today", start_date: kiritimati, end_date: kiritimati }),
  ];
  expect(
    names(await promotions(offers, {}, { TIMEZONE: "Pacific/Kiritimati" })),
  ).toEqual(["Today"]);
  expect(
    names(await promotions(offers, {}, { TIMEZONE: "Pacific/Pago_Pago" })),
  ).toEqual([]);
  const utc = zoneDate("UTC");
  const utcOffers = [offer({ name: "UTC", start_date: utc, end_date: utc })];
  expect(names(await promotions(utcOffers, {}, { MARKET: "MY" }))).toEqual([
    "UTC",
  ]);
  expect(names(await promotions(utcOffers, {}, { MARKET: "PH" }))).toEqual([
    "UTC",
  ]);
});

test("§4 model restrictions keep base and Pro models and different numbers apart, and tolerate extra words", async () => {
  const offers = [
    offer({
      name: "Pro",
      eligible_models: ["iPhone 13 Pro", "iPhone 13 Pro Max"],
    }),
  ];
  expect(names(await promotions(offers, { model: "iPhone 13" }))).toEqual([]);
  expect(names(await promotions(offers, { model: "iPhone 14 Pro" }))).toEqual(
    [],
  );
  expect(
    names(
      await promotions(offers, {
        model: "iPhone 13 Pro 256GB Natural Titanium",
      }),
    ),
  ).toEqual(["Pro"]);
});

test("§4 a request without a model includes model-restricted offers and shows their restrictions", async () => {
  const answer = await promotions(
    [offer({ name: "Pro", eligible_models: ["iPhone 13 Pro"] })],
    {},
  );
  expect(answer.json().promotions[0]?.eligible_models).toEqual([
    "iPhone 13 Pro",
  ]);
});

test("§4 offers that cannot be combined come first, then lower priority numbers, then higher savings", async () => {
  const answer = await promotions(
    [
      offer({
        name: "Stackable",
        stackable: true,
        priority: 0,
        discount_value: 999,
      }),
      offer({ name: "Fixed 200", priority: 1, discount_value: 200 }),
      offer({ name: "Priority 2", priority: 2, discount_value: 900 }),
      offer({
        name: "Ten percent",
        priority: 1,
        discount_type: "percentage",
        discount_value: 10,
      }),
    ],
    { purchase_amount: 2000 },
  );
  expect(names(answer)).toEqual([
    "Ten percent",
    "Fixed 200",
    "Priority 2",
    "Stackable",
  ]);
});

test("§4 two offers that cannot be combined both appear, and the result does not present them as combinable", async () => {
  const answer = await promotions(
    [offer({ name: "A" }), offer({ name: "B" })],
    {},
  );
  expect(answer.json().promotions.map((p) => p.stackable)).toEqual([
    false,
    false,
  ]);
  expect(answer.json().note).toContain(
    "Only stackable offers can be combined.",
  );
});

test("§4 discounts and minimum spends show as whole units, with voucher details and restrictions", async () => {
  const answer = await promotions(
    [
      offer({
        name: "Fixed",
        voucher_code: "RAYA",
        discount_value: 150.75,
        min_spend: 2999.99,
        eligible_models: ["iPhone 15"],
      }),
      offer({
        name: "Percent",
        discount_type: "percentage",
        discount_value: 12.5,
        priority: 2,
      }),
    ],
    { purchase_amount: 2600 },
  );
  expect(answer.json().promotions).toEqual([
    {
      name: "Fixed",
      description: "An offer",
      voucher_code: "RAYA",
      eligible_models: ["iPhone 15"],
      stackable: false,
      priority: 1,
      discount: "RM 150",
      min_spend: "RM 2999",
    },
    {
      name: "Percent",
      description: "An offer",
      voucher_code: "CODE",
      stackable: false,
      priority: 2,
      discount: "12%",
      min_spend: "RM 0",
    },
  ]);
});

test("§4 a valid empty source means no offers, and invalid campaigns are a failure, never no promotions or a free offer", async () => {
  expect((await promotions([], {})).text).toBe(
    "No promotions apply to the request.",
  );
  const world = openWorld();
  world.s3.objects.set(keys.campaigns, "");
  const app = await world.start();
  expect((await app.call("check_promotions", {})).text).toBe(
    "No promotions apply to the request.",
  );
  const invalid = await promotions(
    [{ name: "No discount", discount_type: "fixed" }],
    {},
  );
  expect(invalid).toMatchObject({
    isError: true,
    text: "The campaigns data is unavailable.",
  });
});
