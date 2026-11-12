import { expect, test } from "bun:test";

import {
  promotionsYaml,
  stockCsv,
  stockRow,
  tradeInCsv,
  type TradeInRow,
} from "../fixtures.ts";
import { useService } from "../harness.ts";

type Result = {
  devices: Record<string, string>[];
  message?: string;
  adjustments?: unknown;
};

const variant = (
  Category: string,
  Model: string,
  values: TradeInRow = {},
): TradeInRow => ({
  Category,
  Model,
  Storage: "256GB",
  Year: "2024",
  TradeinPrice: "100",
  ...values,
});

const reference = [
  variant("iPhone", "IPHONE 12", { Storage: "128GB" }),
  variant("iPhone", "IPHONE 13"),
  variant("iPhone", "IPHONE 13 PRO"),
  variant("iPhone", "IPHONE 13 PRO MAX"),
  variant("iPhone", "IPHONE 15"),
  variant("Samsung", "SAMSUNG GALAXY Z FOLD7"),
  variant("Samsung", "SAMSUNG GALAXY Z FLIP7"),
  variant("Samsung", "SAMSUNG GALAXY S25 ULTRA"),
  variant("Samsung", "SAMSUNG GALAXY A15"),
  variant("iPhone", "IPHONE 15 PRO", { Chipset: "A15", Storage: "512GB" }),
  variant("Mac", "MacBook Air", { Storage: "512GB" }),
  variant("Mac", "MacBook Pro", { Storage: "1TB" }),
  variant("Mac", "iMac", { Storage: "1TB" }),
  variant("iPad", "iPad Air", {
    Generation: "5th",
    Connectivity: "WiFi",
    Storage: "64GB",
  }),
  variant("iPad", "iPad Air", {
    Generation: "5th",
    Connectivity: "WiFi+Cellular",
    Storage: "64GB",
  }),
];

const stock = [
  stockRow({
    Category: "U_MAC",
    Model: 'Used MacBook Air 13" M2 2022 256GB 8GB',
    Chipset: "M2",
    Storage: "256GB",
    RAM: "8GB",
  }),
  stockRow({
    Category: "U_IPAD_WC",
    Model: "Used iPad 10th 64GB WiFi + Cellular",
    Generation: "10th",
    Storage: "64GB",
  }),
  stockRow({
    Category: "U_IPAD",
    Model: "Used iPad 10th 64GB WiFi",
    Generation: "10th",
    Storage: "64GB",
  }),
  stockRow({
    Category: "U_WATCH",
    Model: "Used Apple Watch Series 10 42mm GPS",
    Size: "42MM",
  }),
  stockRow({
    Category: "U_WATCH",
    Model: "Used Apple Watch Series 10 42mm GPS + Cellular",
    Size: "42MM",
  }),
];

const service = useService(() => ({
  market: "MY",
  files: {
    "Stock.csv": stockCsv(stock),
    "Trade-in.csv": tradeInCsv(reference),
    "promotions.yaml": promotionsYaml([]),
  },
}));

const value = async (model: string) => {
  const result = (await service().call("check_sale_or_trade_in_value", {
    model,
  })) as Result;
  return result.devices.map((device) =>
    `${device.model} ${device.storage ?? ""}`.trim(),
  );
};
const available = async (model: string) => {
  const result = (await service().call("check_availability", {
    model,
  })) as Result;
  expect(result.adjustments).toBeUndefined();
  return result.devices.map((device) => device.model);
};

test("§1 extra descriptive words, capitalization, and punctuation do not matter", async () => {
  expect(await value("used iPhone 12, with a cracked screen!")).toEqual([
    "IPHONE 12 128GB",
  ]);
  expect(await value("IPHONE 12 BLACK")).toEqual(["IPHONE 12 128GB"]);
});

test("§1 a minor spelling mistake matches when the numbers are the same", async () => {
  expect(await value("Iphne 15")).toEqual(["IPHONE 15 256GB"]);
  expect(await value("Galaxy Z Fold 7")).toEqual([
    "SAMSUNG GALAXY Z FOLD7 256GB",
  ]);
});

test("§1 a spelling tolerance never joins different numbers", async () => {
  expect(await value("Iphne 14")).toEqual([]);
});

test("§1 numbered models and sibling lines stay apart", async () => {
  expect(await value("iPhone 13")).toEqual(["IPHONE 13 256GB"]);
  expect(await value("iPhone 13 Pro")).toEqual(["IPHONE 13 PRO 256GB"]);
  expect(await value("iPhone 13 Pro Max")).toEqual(["IPHONE 13 PRO MAX 256GB"]);
});

test("§1 a description without a number matches the family but not a sibling line", async () => {
  expect(await value("Galaxy Z Fold")).toEqual([
    "SAMSUNG GALAXY Z FOLD7 256GB",
  ]);
  expect(await value("MacBook")).toEqual([
    "MacBook Air 512GB",
    "MacBook Pro 1TB",
  ]);
});

test("§1 a family word matches through the catalogue models that contain it", async () => {
  expect(await value("Galaxy S25 Ultra")).toEqual([
    "SAMSUNG GALAXY S25 ULTRA 256GB",
  ]);
  expect(await value("Galaxy 256GB")).toHaveLength(4);
});

test("§1 Galaxy A15 is a Samsung model, and the article a is not a model word", async () => {
  expect(await value("Galaxy A15")).toEqual(["SAMSUNG GALAXY A15 256GB"]);
  expect(await value("Samsung Galaxy S25 Ultra with a cracked screen")).toEqual(
    ["SAMSUNG GALAXY S25 ULTRA 256GB"],
  );
});

test("§1 a memory value is not the storage", async () => {
  expect(await value("MacBook Pro 16GB RAM 1TB")).toEqual(["MacBook Pro 1TB"]);
});

test("§1 WiFi with cellular, and cellular alone, match the cellular connectivity", async () => {
  for (const description of [
    "iPad Air 5 WiFi+Cellular",
    "iPad Air 5th cellular",
    "iPad Air 5 LTE",
  ]) {
    const result = (await service().call("check_sale_or_trade_in_value", {
      model: description,
    })) as Result;
    expect(result.devices.map((device) => device.connectivity)).toEqual([
      "WiFi+Cellular",
    ]);
  }
  const wifi = (await service().call("check_sale_or_trade_in_value", {
    model: "iPad Air 5 WiFi",
  })) as Result;
  expect(wifi.devices.map((device) => device.connectivity)).toEqual(["WiFi"]);
});

test("§1 the stock model is the title without its specification values", async () => {
  expect(await available("MacBook Air 2022 M2")).toEqual([
    'Used MacBook Air 13" M2 2022 256GB 8GB',
  ]);
});

test("§1 WiFi or GPS with optional cellular reads from the stock titles", async () => {
  expect(await available("iPad 10th WiFi Cellular")).toEqual([
    "Used iPad 10th 64GB WiFi + Cellular",
  ]);
  expect(await available("Apple Watch Series 10 GPS cellular")).toEqual([
    "Used Apple Watch Series 10 42mm GPS + Cellular",
  ]);
  expect(await available("Apple Watch Series 10 42mm GPS")).toEqual([
    "Used Apple Watch Series 10 42mm GPS",
  ]);
});
