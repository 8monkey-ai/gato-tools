import { expect, test } from "bun:test";

import { promotions, useCampaigns } from "./offers.ts";

const service = useCampaigns(() => []);
const noOffers = {
  promotions: [],
  message: "No promotion applies to the request.",
};

test("§4 a valid empty list means no offers", async () => {
  expect(await promotions(service(), {})).toEqual(noOffers);
});

test("§4 a valid empty file means no offers", async () => {
  service().s3.put("promotions.yaml", "");
  await service().restart();
  expect(await promotions(service(), {})).toEqual(noOffers);
});

test("§4 an unusable file at startup reports a failure, not no promotions or a free offer", async () => {
  service().s3.put(
    "promotions.yaml",
    "- name: Free phone\n  discount_type: free\n",
  );
  await service().restart();
  const result = await promotions(service(), {});
  expect(result.error).toBe("Promotion data is unavailable.");
  expect(Object.keys(result)).toEqual(["error"]);
});
