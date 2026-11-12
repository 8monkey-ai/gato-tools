import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";

const service = useService(async () => {
  const { "Trade-in.csv": _reference, ...files } = await sampleFiles();
  return { market: "PH", files };
});

test("§5 the country defaults to the country of the configured market", async () => {
  await service().call("find_location", { user_location: "SM Megamall" });
  expect(service().geocoding.calls.at(-1)?.get("address")).toBe(
    "SM Megamall, Philippines",
  );
});
