import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";
import { tool, value } from "./value.ts";

const service = useService(async () => {
  const { "Trade-in.csv": _reference, ...files } = await sampleFiles();
  return { market: "PH", files };
});

test("§3 a PH deployment does not expose or permit the tool", async () => {
  expect(await service().listTools()).not.toContain(tool);
  expect((await value(service(), "iPhone 12")).error).toContain(
    `Tool ${tool} not found`,
  );
});
