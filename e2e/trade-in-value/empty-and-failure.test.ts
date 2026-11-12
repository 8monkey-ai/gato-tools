import { expect, test } from "bun:test";

import { tradeInCsv } from "../fixtures.ts";
import { sampleFiles, useService } from "../harness.ts";
import { value } from "./value.ts";

const service = useService(async () => ({
  market: "MY",
  files: { ...(await sampleFiles()), "Trade-in.csv": tradeInCsv([]) },
}));

test("§3 an empty reference has its own outcome", async () => {
  expect(await value(service(), "iPhone 12")).toEqual({
    devices: [],
    message: "The trade-in reference has no devices.",
  });
});

test("§3 a missing reference is a source failure", async () => {
  service().s3.remove("Trade-in.csv");
  await service().restart();
  const result = await value(service(), "iPhone 12");
  expect(result.error).toBe("Trade-in data is unavailable.");
  expect(Object.keys(result)).toEqual(["error"]);
});
