import { expect, test } from "bun:test";

import { device, stockFeed } from "./support/data.ts";
import { models, openWorld, prices, search } from "./support/search.ts";
import { keys } from "./support/world.ts";

test('§2 "Used iPhone 12 Black 128GB" identifies the model, the used condition, the color, and the storage', async () => {
  const answer = await search(
    [
      device({ condition: "New", retailPrice: "1" }),
      device({ color: "White", retailPrice: "2" }),
      device({ storage: "256GB", retailPrice: "3" }),
      device({ model: "iPhone 13", retailPrice: "4" }),
      device({ retailPrice: "5" }),
    ],
    { model: "Used iPhone 12 Black 128GB" },
  );
  expect(answer.json().devices).toEqual([
    {
      model: "iPhone 12",
      condition: "Used",
      color: "Black",
      storage: "128GB",
      availability: "Stock Present",
      available_stores: "Low Yat Plaza",
      retail_price: "RM 5",
    },
  ]);
  expect(answer.json().adjustments).toBeUndefined();
});

test('§2 "iPad Air 5" is the fifth generation and "iPad Pro 11" is the 11-inch size', async () => {
  const ipad = (
    model: string,
    generation: string,
    size: string,
    retailPrice: string,
  ) =>
    device({
      category: "iPad",
      model,
      generation,
      size,
      color: "",
      storage: "",
      retailPrice,
    });
  const rows = [
    ipad("iPad Air", "5th", '11"', "1"),
    ipad("iPad Air", "4th", '11"', "2"),
    ipad("iPad Pro", "4th", '11"', "3"),
    ipad("iPad Pro", "4th", '13"', "4"),
  ];
  expect(prices(await search(rows, { model: "iPad Air 5" }))).toEqual(["RM 1"]);
  expect(prices(await search(rows, { model: "iPad Pro 11" }))).toEqual([
    "RM 3",
  ]);
});

test('§2 "Natural Titanium" is a color and not a material, and Black matches Space Black', async () => {
  const rows = [
    device({
      model: "iPhone 15 Pro",
      color: "Natural Titanium",
      material: "",
      retailPrice: "1",
    }),
    device({
      model: "iPhone 15 Pro",
      color: "Black Titanium",
      material: "Titanium",
      retailPrice: "2",
    }),
    device({
      model: "iPhone 15 Pro",
      color: "Space Black",
      material: "Aluminium",
      retailPrice: "3",
    }),
  ];
  expect(
    prices(await search(rows, { model: "iPhone 15 Pro Natural Titanium" })),
  ).toEqual(["RM 1"]);
  expect(prices(await search(rows, { model: "iPhone 15 Pro Black" }))).toEqual([
    "RM 3",
    "RM 2",
  ]);
});

test("§2 1TB does not match 1024GB, iPhone 12 does not match iPhone 13, and iPad Air matches a numbered iPad Air but not an iPad Pro", async () => {
  const terabyte = await search([device({ storage: "1024GB" })], {
    model: "iPhone 12 1TB",
  });
  expect(terabyte.json().adjustments).toEqual({
    dropped_preferences: ["storage"],
  });
  expect(
    (await search([device({ model: "iPhone 13" })], { model: "iPhone 12" }))
      .text,
  ).toBe("No devices match the request.");
  const air = await search(
    [
      device({ category: "iPad", model: "iPad Air 5", retailPrice: "1" }),
      device({ category: "iPad", model: "iPad Pro 5", retailPrice: "2" }),
    ],
    { model: "iPad Air" },
  );
  expect(models(air)).toEqual(["iPad Air 5"]);
});

test("§2 exact available matches give no relaxation and no substitution", async () => {
  const answer = await search(
    [
      device({ retailPrice: "2" }),
      device({ availability: "Low Stock", retailPrice: "1" }),
    ],
    { model: "iPhone 12 Black 128GB" },
  );
  expect(prices(answer)).toEqual(["RM 2", "RM 1"]);
  expect(answer.json().adjustments).toBeUndefined();
});

test("§2 when condition and color removal find nothing and storage removal finds results, the report names storage only", async () => {
  const answer = await search(
    [device({ condition: "New", color: "White", storage: "256GB" })],
    {
      model: "Used iPhone 12 Black 128GB",
    },
  );
  expect(answer.json().adjustments).toEqual({
    dropped_preferences: ["storage"],
  });
});

test("§2 a model number alone does not restrict stock, and no description searches all stock", async () => {
  const rows = [
    device({ model: "iPhone 12" }),
    device({ category: "Mac", model: "MacBook Air" }),
  ];
  expect(models(await search(rows, { model: "A2172" }))).toHaveLength(2);
  expect(models(await search(rows, {}))).toHaveLength(2);
});

test("§2 devices with any other stock status are omitted, and the stores follow the stock status", async () => {
  const answer = await search(
    [
      device({ availability: "Discontinued", retailPrice: "4" }),
      device({ availability: "Stock Present", stores: [], retailPrice: "3" }),
      device({
        availability: "Low Stock",
        stores: ["A", "B"],
        retailPrice: "2",
      }),
    ],
    { model: "iPhone 12" },
  );
  expect(answer.json().devices.map((d) => d.available_stores)).toEqual([
    "Online Only",
    "A, B",
  ]);
  const out = await search([device({ availability: "Out of Stock" })], {
    model: "iPhone 12",
  });
  expect(out.json().devices[0]?.available_stores).toBeUndefined();
});

test("§2 supplied prices, a monthly quote, and checkout and video links appear as supplied", async () => {
  const answer = await search(
    [
      device({
        promotionPrice: "1400",
        lastMonthPrice: "1600",
        otherPrices: [
          { name: "xox_bundle_price", amount: "1300", monthly: false },
          { name: "ansuran_mudah_12_months", amount: "96.50", monthly: true },
        ],
        checkoutLink: "https://shop.example/iphone-12",
        videoLinks: ["https://video.example/1"],
      }),
    ],
    { model: "iPhone 12" },
  );
  expect(answer.json().devices[0]).toMatchObject({
    promotion_price: "RM 1400",
    retail_price: "RM 1500",
    last_month_price: "RM 1600",
    other_prices: {
      xox_bundle_price: "RM 1300",
      ansuran_mudah_12_months: "RM 96.50/month",
    },
    checkout_link: "https://shop.example/iphone-12",
    video_link: "https://video.example/1",
  });
});

test("§2 different calls can select different videos of a device", async () => {
  const world = openWorld();
  const links = [
    "https://v.example/1",
    "https://v.example/2",
    "https://v.example/3",
  ];
  world.s3.objects.set(keys.stock, stockFeed(device({ videoLinks: links })));
  const app = await world.start();
  const seen = new Set<unknown>();
  for (let i = 0; i < 30 && seen.size < 2; i++)
    seen.add(
      (await app.call("check_availability", {})).json().devices[0]?.video_link,
    );
  expect(seen.size).toBeGreaterThan(1);
});

test("§2 the outcomes for an unrecognized description, a category not in the catalogue, no match, and an empty list after price exclusion are distinct", async () => {
  const rows = [device({ retailPrice: "1,500" })];
  expect((await search(rows, { model: "zzzz not a device" })).text).toBe(
    "The device is not recognized. Ask for a different description.",
  );
  expect((await search(rows, { model: "OPPO Find X8" })).text).toBe(
    "The catalogue has no devices of this category.",
  );
  expect((await search(rows, { model: "iPhone 99" })).text).toBe(
    "No devices match the request.",
  );
  const empty = await search(rows, { model: "iPhone 12" });
  expect(empty).toMatchObject({ isError: false });
  expect(empty.text).toBe('{"devices":[]}');
});
