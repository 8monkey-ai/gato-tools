import { expect, test } from "bun:test";

import {
  dateIn,
  offerNames,
  promotions,
  todayCampaigns,
  useCampaigns,
} from "./offers.ts";

const service = useCampaigns(todayCampaigns, { market: "PH" });

test("§1 §4 a PH deployment with no timezone setting uses UTC", async () => {
  const names = await offerNames(service(), {});
  expect(names).toContain("UTC today");
  if (dateIn("UTC") !== dateIn("Pacific/Kiritimati"))
    expect(names).not.toContain("Kiritimati today");
});

test("§4 a PH deployment shows fixed amounts in PHP", async () => {
  const result = await promotions(service(), {});
  expect(result.promotions[0]?.discount).toBe("PHP 100");
});
