import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";
import { check } from "./check.ts";

const service = useService(async () => {
  const { "Stock.csv": _stock, ...files } = await sampleFiles();
  return { market: "MY", files };
});

test("§2 a failed initial load is a source failure, not no stock", async () => {
  const result = await check(service(), { model: "iPhone 12" });
  expect(result.error).toBe("Stock data is unavailable.");
  expect(Object.keys(result)).toEqual(["error"]);
});
