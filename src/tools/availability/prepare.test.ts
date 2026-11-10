import { expect, test } from "bun:test";

import mappings from "../../../config/stock-feed-mappings.MY.json";
import { parseStockMappings, prepareStock } from "./prepare.ts";

test("the Malaysian mappings read a stock export that has all their columns", () => {
  const columns = [...mappings.branches, ...mappings.prices].map(
    (m) => m.column,
  );
  const header = [
    "Category",
    "Condition",
    "Model",
    "Color",
    "Case Material",
    "Total Stock",
    "Retail Price",
    ...columns,
  ];
  const values = [
    "U_WATCH",
    "Used",
    "Apple Watch Series 9 GPS 45mm Midnight Aluminium",
    "Midnight",
    "Aluminium",
    "2",
    "1299",
    ...columns.map((c) =>
      c === "LowYatPlaza"
        ? "1"
        : c === "AnsuranMudahPrice12Month"
          ? "110"
          : "0",
    ),
  ];
  const [row] = prepareStock(
    `${header.join(",")}\n${values.join(",")}\n`,
    parseStockMappings(mappings),
  );
  expect(row).toMatchObject({
    category: "Apple Watch",
    model: "Apple Watch Series 9",
    connectivity: "GPS",
    size: "45MM",
    material: "Aluminium",
    availability: "Low Stock",
    retailPrice: "1299",
    stores: ["[Klang Valley] Low Yat Plaza"],
  });
  expect(row?.otherPrices.map((p) => p.name)).toContain(
    "ansuran_mudah_price_12month_tenure",
  );
});
