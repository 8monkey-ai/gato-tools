import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";
import { health } from "./health.ts";

const service = useService(async () => {
  const { "Trade-in.csv": _reference, ...files } = await sampleFiles();
  return { market: "PH", files };
});

test("§1 a PH deployment exposes device availability, promotions, and location lookup only", async () => {
  expect(await service().listTools()).toEqual([
    "check_availability",
    "check_promotions",
    "find_location",
  ]);
});

test("§1 a PH deployment uses PHP and checks only its own sources", async () => {
  const result = (await service().call("check_availability", {
    model: "Used iPhone 12 Black 128GB",
  })) as { devices: { retail_price: string }[] };
  expect(result.devices[0]?.retail_price).toBe("PHP 1029");
  const { code, body } = await health(service());
  expect(code).toBe(200);
  expect(body.sources.map((source) => source.source)).toEqual([
    "stock",
    "promotions",
  ]);
  expect(service().s3.calls.some((call) => call.key === "Trade-in.csv")).toBe(
    false,
  );
});
