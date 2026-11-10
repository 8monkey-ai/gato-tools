import { expect, test } from "bun:test";

import { waitUntil } from "./support/app.ts";
import { csv } from "./support/data.ts";
import { openWorld } from "./support/search.ts";
import { keys } from "./support/world.ts";

const header = [
  "Category",
  "Model",
  "ModelNumber",
  "Storage",
  "Year",
  "TradeinPrice",
];
const reference = (...rows: string[][]) => csv(header, rows);

async function value(referenceCsv: string, model: string) {
  const world = openWorld();
  world.s3.objects.set(keys.tradeIn, referenceCsv);
  const app = await world.start();
  return app.call("check_sale_or_trade_in_value", { model });
}

const values = (answer: Awaited<ReturnType<typeof value>>) =>
  answer.json().devices.map((d) => d.value);

test('§3 query "A2172" matches a row whose model-number text is "A2172, A2402"', async () => {
  const answer = await value(
    reference(["iPhone", "IPHONE 12", "A2172, A2402", "128GB", "2020", "500"]),
    "A2172",
  );
  expect(answer.json().devices).toEqual([
    { model: "IPHONE 12", storage: "128GB", year: "2020", value: "RM 500" },
  ]);
});

test("§3 a model number in two rows returns both variants, even when the request names other specifications", async () => {
  const answer = await value(
    reference(
      ["iPhone", "IPHONE 12", "A2172", "128GB", "2020", "500"],
      ["iPhone", "IPHONE 12", "A2172", "256GB", "2020", "600"],
      ["iPhone", "IPHONE 13", "A2482", "128GB", "2021", "700"],
    ),
    "iPhone 12 512GB A2172",
  );
  expect(values(answer)).toEqual(["RM 500", "RM 600"]);
});

test("§3 128GB with only 256GB rows gives no match, not another variant or a neighboring model", async () => {
  const answer = await value(
    reference(
      ["iPhone", "IPHONE 12", "", "256GB", "2020", "600"],
      ["iPhone", "IPHONE 13", "", "128GB", "2021", "700"],
    ),
    "iPhone 12 128GB",
  );
  expect(answer.text).toBe("No trade-in variant matches the request.");
});

test("§3 a blank specification cell matches any requested value", async () => {
  const answer = await value(
    reference(["iPhone", "IPHONE 12", "", "", "2020", "500"]),
    "iPhone 12 128GB",
  );
  expect(values(answer)).toEqual(["RM 500"]);
});

test("§3 ten matches return all ten newest first, and eleven ask for a narrower query", async () => {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, i) => [
      "iPhone",
      "IPHONE 12",
      "",
      `${i}GB`,
      ["2019", "", "2021"][i % 3]!,
      String(i),
    ]);
  const ten = await value(reference(...rows(10)), "iPhone 12");
  expect(values(ten)).toEqual(
    ["2", "5", "8", "0", "3", "6", "9", "1", "4", "7"].map((v) => `RM ${v}`),
  );
  expect(ten.json().devices[0]?.year).toBe("2021");
  expect(ten.json().devices.at(-1)?.year).toBeUndefined();
  const eleven = await value(reference(...rows(11)), "iPhone 12");
  expect(eleven.text).toBe(
    "More than 10 variants match. Ask for a narrower description, for example with storage or size.",
  );
});

test("§3 color and condition do not change the value", async () => {
  const rows = reference(["iPhone", "IPHONE 12", "", "128GB", "2020", "500"]);
  for (const model of [
    "Black iPhone 12",
    "used iPhone 12 with a cracked screen",
    "iPhone 12",
  ])
    expect(values(await value(rows, model))).toEqual(["RM 500"]);
});

test("§3 an absent price shows 0 in RM, and a supplied blank price stays blank", async () => {
  const absent = await value(
    csv(["Category", "Model"], [["iPhone", "IPHONE 12"]]),
    "iPhone 12",
  );
  expect(values(absent)).toEqual(["RM 0"]);
  const blank = await value(
    reference(["iPhone", "IPHONE 12", "", "", "", ""]),
    "iPhone 12",
  );
  expect(values(blank)).toEqual([""]);
});

test("§3 the outcomes for an unrecognized model, an unsupported category, no match, an empty reference, and a source failure are distinct", async () => {
  const rows = reference(["iPhone", "IPHONE 12", "", "128GB", "2020", "500"]);
  expect((await value(rows, "asdfghjkl random junk")).text).toBe(
    "The device is not recognized. Ask for a different description.",
  );
  expect((await value(rows, "Google Pixel 9")).text).toBe(
    "Trade-in is not offered for this category.",
  );
  expect((await value(rows, "iPhone 99")).text).toBe(
    "No trade-in variant matches the request.",
  );
  expect((await value(reference(), "iPhone 12")).text).toBe(
    "The trade-in reference has no devices.",
  );
  const failed = await value("Model\nIPHONE 12\n", "iPhone 12");
  expect(failed).toMatchObject({
    isError: true,
    text: "The trade-in data is unavailable.",
  });
});

const tradeInExport = csv(
  [
    "Category",
    "Model Name",
    "Model Number",
    "Display",
    "Storage",
    "Year",
    "Generation",
    "Price",
  ],
  [
    ["PHONE", "IPHONE 15", "A2846, A3090", "", "128GB", "2023", "", "3,500"],
    [
      "Pad",
      "iPad Pro 11-inch Wi-Fi + Cellular",
      "A 2301",
      "11-inch",
      "256GB",
      "2021",
      "3",
      "1200",
    ],
    ["Watch", "Apple Watch Series 9", "", "", "", "2023", "", "400"],
  ],
);

test("§3 a newly prepared feed keeps model numbers, specifications, and values, and does not change the serving reference", async () => {
  const world = openWorld();
  world.s3.objects.set("data/Trade-in.csv", tradeInExport);
  const servingReference = reference([
    "iPhone",
    "IPHONE 12",
    "",
    "128GB",
    "2020",
    "500",
  ]);
  world.s3.objects.set(keys.tradeIn, servingReference);
  const app = await world.start({
    TRADE_IN_EXPORT_KEY: "data/Trade-in.csv",
    TRADE_IN_FEED_KEY: "data/Trade-in-prepared.csv",
  });
  const prepared = await waitUntil(() =>
    world.s3.objects.get("data/Trade-in-prepared.csv"),
  );
  expect(prepared).toBe(
    "Category,Model,Generation,ModelNumber,Size,Storage,Year,Chipset,Material,Connectivity,TradeinPrice\n" +
      'iPhone,IPHONE 15,,"A2846,A3090",,128GB,2023,,,,"3,500"\n' +
      'iPad,iPad Pro,3rd,A2301,"11""",256GB,2021,,,WiFi+Cellular,1200\n',
  );
  expect(world.s3.objects.get(keys.tradeIn)).toBe(servingReference);
  expect(
    values(
      await app.call("check_sale_or_trade_in_value", { model: "iPhone 12" }),
    ),
  ).toEqual(["RM 500"]);
  expect(
    (await app.call("check_sale_or_trade_in_value", { model: "iPhone 15" }))
      .text,
  ).toBe("No trade-in variant matches the request.");
});
