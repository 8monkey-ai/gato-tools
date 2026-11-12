import { expect, test } from "bun:test";

import { tradeInCsv, type TradeInRow } from "../fixtures.ts";
import { sampleFiles, useService } from "../harness.ts";
import { value } from "./value.ts";

const row = (values: TradeInRow): TradeInRow => ({
  Category: "Mac",
  Storage: "256GB",
  TradeinPrice: "500",
  ...values,
});
const years = (model: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    row({ Model: model, Year: String(2010 + index) }),
  );

const service = useService(async () => ({
  market: "MY",
  files: {
    ...(await sampleFiles()),
    "Trade-in.csv": tradeInCsv([
      ...years("MacBook Pro", 11),
      ...years("MacBook Air", 10),
      row({
        Category: "iPad",
        Model: "iPad Pro",
        Year: "2019",
        TradeinPrice: "300",
      }),
      row({
        Category: "iPad",
        Model: "iPad Pro",
        Year: "",
        TradeinPrice: "200",
      }),
      row({
        Category: "iPad",
        Model: "iPad Pro",
        Year: "2021",
        TradeinPrice: "400",
      }),
      {
        Category: "iPhone",
        Model: "IPHONE 12",
        Storage: "",
        Year: "2020",
        TradeinPrice: "450",
      },
      { Category: "iPhone", Model: "IPHONE 11", Storage: "64GB" },
      {
        Category: "iPhone",
        Model: "IPHONE 11",
        Storage: "128GB",
        TradeinPrice: "",
      },
    ]),
  },
}));

test("§3 ten matches return all ten", async () => {
  expect((await value(service(), "MacBook Air")).devices).toHaveLength(10);
});

test("§3 eleven matches return a request for a narrower query", async () => {
  expect(await value(service(), "MacBook Pro")).toEqual({
    devices: [],
    message:
      "More than 10 variants match the request. Ask for more details, for example the storage or the year.",
  });
});

test("§3 newest year first, and a variant with no year comes last", async () => {
  const result = await value(service(), "iPad Pro");
  expect(result.devices.map((device) => device.trade_in_price)).toEqual([
    "RM 400",
    "RM 300",
    "RM 200",
  ]);
});

test("§3 a blank specification cell matches any requested value", async () => {
  expect((await value(service(), "iPhone 12 512GB")).devices).toEqual([
    { model: "IPHONE 12", year: "2020", trade_in_price: "RM 450" },
  ]);
});

test("§3 an absent price shows 0 and a supplied blank price stays blank", async () => {
  expect((await value(service(), "iPhone 11 64GB")).devices).toEqual([
    { model: "IPHONE 11", storage: "64GB", trade_in_price: "RM 0" },
  ]);
  expect((await value(service(), "iPhone 11 128GB")).devices).toEqual([
    { model: "IPHONE 11", storage: "128GB" },
  ]);
});
