import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";
import { tool, value } from "./value.ts";

const service = useService(async () => ({
  market: "MY",
  files: await sampleFiles(),
}));

test("§3 a model number matches the rows whose ModelNumber contains it", async () => {
  const result = await value(service(), "A2172");
  expect(result.devices.map((device) => device.storage)).toEqual([
    "64GB",
    "128GB",
    "256GB",
  ]);
  expect(result.devices[1]).toEqual({
    model: "IPHONE 12",
    storage: "128GB",
    year: "2020",
    trade_in_price: "RM 490",
  });
});

test("§3 a model number takes precedence over the other specifications", async () => {
  const result = await value(service(), "A2172 128GB");
  expect(result.devices.map((device) => device.storage)).toEqual([
    "64GB",
    "128GB",
    "256GB",
  ]);
});

test("§3 a missing variant gives the no-match outcome and no neighbor", async () => {
  expect(await value(service(), "iPhone 17 Pro 128GB")).toEqual({
    devices: [],
    message:
      "No trade-in variant matches the request. Confirm the model and specifications.",
  });
});

test("§3 color and condition do not change the value", async () => {
  for (const model of [
    "Black iPhone 12 128GB",
    "used iPhone 12 128GB with a cracked screen",
    "iPhone 12 128GB",
  ]) {
    const result = await value(service(), model);
    expect(result.devices.map((device) => device.trade_in_price)).toEqual([
      "RM 490",
    ]);
  }
});

test("§3 a category that the reference does not have gives the unrecognized outcome", async () => {
  expect(await value(service(), "Google Pixel 9")).toEqual({
    devices: [],
    message:
      "The device is not recognized. Trade-in categories: Mac, iPad, iPhone, Samsung. Ask for the full product name.",
  });
});

test("§3 the tool description says that the value is not a binding offer and has no deductions", async () => {
  const description = await service().toolDescription(tool);
  expect(description).toContain("not a binding offer");
  expect(description).toContain("Battery, screen, scratch, dent");
});
