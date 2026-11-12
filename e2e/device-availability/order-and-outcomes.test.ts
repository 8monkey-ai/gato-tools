import { expect, test } from "bun:test";

import { stockCsv, stockRow } from "../fixtures.ts";
import { sampleFiles, useService } from "../harness.ts";
import { check, models } from "./check.ts";

const prices = [
  1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200,
];

const service = useService(async () => ({
  market: "MY",
  files: {
    ...(await sampleFiles()),
    "Stock.csv": stockCsv([
      ...prices.map((price) =>
        stockRow({
          Category: "U_IPAD",
          Model: `Used iPad Pro ${price}`,
          "Retail Price": String(price),
        }),
      ),
      stockRow({
        Category: "U_HONOR",
        Model: "Used Honor Magic 6 Pro",
        "Store Lookup": "@New Store Kuching",
      }),
      stockRow({ Model: "Used iPhone 9 64GB", "Retail Price": "TBC" }),
      stockRow({
        Model: "Used iPhone 11 64GB",
        "Video Link": "https://videos.example.com/landscape.mp4",
        "Portrait Video": "https://videos.example.com/portrait.mp4",
      }),
      stockRow({
        Model: "Used iPhone 10 64GB",
        "Video Link": "https://videos.example.com/same.mp4",
        "Portrait Video": "https://videos.example.com/same.mp4",
        "Checkout Link": "N/A",
      }),
    ]),
  },
}));

const retailPrices = async (args: Record<string, unknown>) =>
  (await check(service(), args)).devices.map((device) => device.retail_price);

test("§2 twelve matches give ten devices, highest price first by default", async () => {
  expect(await retailPrices({ model: "iPad Pro" })).toEqual(
    [2200, 2100, 2000, 1900, 1800, 1700, 1600, 1500, 1400, 1300].map(
      (price) => `RM ${price}`,
    ),
  );
});

test("§2 lowest price first on request", async () => {
  expect(await retailPrices({ model: "iPad Pro", sort_order: "asc" })).toEqual(
    [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000].map(
      (price) => `RM ${price}`,
    ),
  );
});

test("§2 a new category code and a new store need no code change", async () => {
  const result = await check(service(), { model: "Honor" });
  expect(models(result)).toEqual(["Used Honor Magic 6 Pro"]);
  expect(result.devices[0]?.available_stores).toBe("New Store Kuching");
  const unknown = await check(service(), { model: "Nokia" });
  expect(unknown.message).toContain("IPAD, HONOR, IPHONE");
});

test("§2 an empty list after price exclusion differs from the no-match outcome", async () => {
  expect(await check(service(), { model: "iPhone 9" })).toEqual({
    devices: [],
  });
});

test("§2 two equal video links are one candidate, and N/A shows as no value", async () => {
  const [device] = (await check(service(), { model: "iPhone 10" })).devices;
  expect(device?.video_link).toBe("https://videos.example.com/same.mp4");
  expect(device?.checkout_link).toBeUndefined();
});

test("§2 with two different video candidates, different calls can select different videos", async () => {
  const videos = new Set<string | undefined>();
  for (let call = 0; call < 40; call += 1) {
    videos.add(
      (await check(service(), { model: "iPhone 11" })).devices[0]?.video_link,
    );
  }
  expect([...videos].toSorted()).toEqual([
    "https://videos.example.com/landscape.mp4",
    "https://videos.example.com/portrait.mp4",
  ]);
});
