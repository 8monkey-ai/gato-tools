import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";
import { check, models } from "./check.ts";

const service = useService(async () => ({
  market: "MY",
  files: await sampleFiles(),
}));

test("§2 Used iPhone 12 Black 128GB identifies used condition, color Black, and 128GB storage", async () => {
  const result = await check(service(), {
    model: "Used iPhone 12 Black 128GB",
  });
  expect(models(result)).toEqual(["Used iPhone 12 128GB Black"]);
  expect(result.devices[0]).toMatchObject({
    condition: "USED",
    color: "Black",
    storage: "128GB",
  });
  expect(result.adjustments).toBeUndefined();
});

test("§2 iPad Air 5 matches the fifth generation", async () => {
  const result = await check(service(), { model: "iPad Air 5" });
  expect(models(result)).toEqual(["Used iPad Air 5th 64GB WiFi + Cellular"]);
});

test("§2 iPad Pro 11 matches the 11-inch size", async () => {
  const result = await check(service(), { model: "iPad Pro 11" });
  expect(result.devices.length).toBeGreaterThan(0);
  for (const device of result.devices) expect(device.size).toBe('11"');
});

test("§2 Store Lookup gives the stores in display order without the @", async () => {
  const result = await check(service(), { model: "iPad Air 5" });
  expect(result.devices[0]?.available_stores).toBe(
    "The Mines Shopping Mall, [JOHOR] AEON Kulaijaya",
  );
});

test("§2 a Low Stock device with a blank Store Lookup says Online Only", async () => {
  const result = await check(service(), {
    model: "Used iPhone 13 256GB Starlight",
  });
  expect(result.devices[0]).toMatchObject({
    model: "Used iPhone 13 256GB Starlight",
    availability: "Low Stock",
    available_stores: "Online Only",
  });
});

test("§2 the supplied prices, links, and XOX bundle price appear in the market currency", async () => {
  const result = await check(service(), {
    model: "Used iPhone 13 256GB Starlight",
  });
  expect(result.devices[0]).toMatchObject({
    retail_price: "RM 1359",
    promotion_price: "RM 1179",
    xox_bundle_price: "RM 479",
    checkout_link:
      "https://shop.example.com/checkout/cart?product_url=used-iphone-13-256gb-starlight",
    video_link: "https://videos.example.com/sample-video-040.mp4",
  });
  expect(result.devices[0]?.last_month_price).toBeUndefined();
});

test('§2 "Ask Store" and a video link of "0" show as no value', async () => {
  const [device] = (await check(service(), { model: "iPad Air 5" })).devices;
  expect(device?.color).toBeUndefined();
  expect(device?.video_link).toBe(
    "https://videos.example.com/sample-video-018.mp4",
  );
});

test("§2 iPad searches the rows of both U_IPAD and U_IPAD_WC", async () => {
  const result = await check(service(), { model: "iPad", sort_order: "asc" });
  const names = models(result).join("\n");
  expect(names).toContain("WiFi + Cellular");
  expect(names).toMatch(/WiFi$/m);
});

test("§2 iPad Air matches a numbered iPad Air but not an iPad Pro", async () => {
  const result = await check(service(), { model: "iPad Air" });
  expect(result.devices.length).toBeGreaterThan(0);
  for (const model of models(result)) expect(model).toMatch(/iPad Air/);
});

test("§2 an unrecognized description names the categories of the catalogue", async () => {
  expect(await check(service(), { model: "Nokia 3310" })).toEqual({
    devices: [],
    message:
      "The device is not recognized. Known categories: IPHONE, WATCH, PIXEL, IPAD, MAC, SAMSUNG. Ask for the full product name.",
  });
});

test("§2 a request with no model covers all eligible stock", async () => {
  const result = await check(service(), {});
  expect(result.devices).toHaveLength(10);
  expect(result.devices[0]?.model).toBe(
    "New iPhone 17 Pro Max 2TB Cosmic Orange",
  );
});

test("§2 a request with only a model number does not restrict stock", async () => {
  const all = await check(service(), {});
  expect(models(await check(service(), { model: "A2172" }))).toEqual(
    models(all),
  );
});

test("§1 a stock title with a size and a generation matches its own row", async () => {
  const result = await check(service(), {
    model: "Used iPad Pro 11 3rd 128GB WiFi",
  });
  expect(models(result)).toEqual(["Used iPad Pro 11 3rd 128GB WiFi"]);
  expect(result.adjustments).toBeUndefined();
});
