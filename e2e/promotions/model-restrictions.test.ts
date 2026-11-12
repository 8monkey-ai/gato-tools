import { expect, test } from "bun:test";

import { offerNames, promotions, useCampaigns } from "./offers.ts";

const service = useCampaigns(() => [
  { name: "Pro only", eligible_models: ["iPhone 15 Pro"] },
  { name: "Number 14", eligible_models: ["iPhone 14"] },
  { name: "Base 15", eligible_models: ["iPhone 15"] },
  { name: "Air 1TB", eligible_models: ["New iPhone Air 1TB"] },
  { name: "Samsung", eligible_models: ["Used Samsung Galaxy S25 Ultra 256GB"] },
  { name: "All models" },
]);

const at = (model: string) =>
  offerNames(service(), { model, purchase_date: "2026-05-01" });

test("§4 a base model does not qualify for an offer restricted to the Pro model", async () => {
  expect(await at("iPhone 15")).toEqual(["Base 15", "All models"]);
});

test("§4 a numbered model does not qualify for an offer on a different number", async () => {
  expect(await at("iPhone 13")).toEqual(["All models"]);
});

test("§4 a request with extra words qualifies for an offer on its model", async () => {
  expect(await at("iPhone 15 Pro 256GB Black Titanium")).toEqual([
    "Pro only",
    "All models",
  ]);
});

test("§4 iPhone Air 1TB qualifies for New iPhone Air 1TB, and another condition or storage does not", async () => {
  expect(await at("iPhone Air 1TB")).toContain("Air 1TB");
  expect(await at("Used iPhone Air 1TB")).not.toContain("Air 1TB");
  expect(await at("iPhone Air 512GB")).not.toContain("Air 1TB");
});

test("§4 a request without a model includes model-restricted offers and shows their restrictions", async () => {
  const result = await promotions(service(), { purchase_date: "2026-05-01" });
  expect(
    result.promotions.map((offer) => [offer.name, offer.eligible_models]),
  ).toEqual([
    ["Pro only", "iPhone 15 Pro"],
    ["Number 14", "iPhone 14"],
    ["Base 15", "iPhone 15"],
    ["Air 1TB", "New iPhone Air 1TB"],
    ["Samsung", "Used Samsung Galaxy S25 Ultra 256GB"],
    ["All models", undefined],
  ]);
});

test("§4 the brand word of an eligible model is optional, as in device matching", async () => {
  expect(await at("Galaxy S25 Ultra 256GB")).toEqual(["Samsung", "All models"]);
  expect(await at("Galaxy S25 Ultra 512GB")).toEqual(["All models"]);
});
