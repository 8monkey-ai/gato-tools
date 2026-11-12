import { expect, test } from "bun:test";

import { dateIn, offerNames, todayCampaigns, useCampaigns } from "./offers.ts";

const service = useCampaigns(todayCampaigns, {
  timezone: "Pacific/Kiritimati",
});

test("§4 an omitted date uses today in the configured timezone", async () => {
  const names = await offerNames(service(), {});
  expect(names).toContain("Kiritimati today");
  if (dateIn("UTC") !== dateIn("Pacific/Kiritimati"))
    expect(names).not.toContain("UTC today");
});
