import { expect, test } from "bun:test";

import { readCsv } from "./csv.ts";

test("header names lose spaces, line breaks, and a byte order mark", () => {
  const rows = readCsv(
    '\uFEFFRetail Price,"Total Stock\n(Excld Sabah)"\n1029,20\n',
    ["RetailPrice"],
  );
  expect(rows).toEqual([
    { RetailPrice: "1029", "TotalStock(ExcldSabah)": "20" },
  ]);
});

test("filler cells read as blank, and a cell that a short row lacks stays absent", () => {
  const [row] = readCsv("A,B,C\nN/A, Ask Store \n", ["A"]);
  expect(row).toEqual({ A: "", B: "" });
});

test("a missing required column makes the file unusable", () => {
  expect(() => readCsv("A,B\n1,2\n", ["A", "Model"])).toThrow(
    "missing columns: Model",
  );
});

test("a header with no rows is an empty source", () => {
  expect(readCsv("A,B\n", ["A"])).toEqual([]);
});
