import {
  buildCatalogue,
  type Catalogue,
  type Device,
} from "../../matching/catalogue.ts";
import {
  normalizeSpec,
  readGenericSpecs,
  type SpecName,
  type Specs,
} from "../../matching/specs.ts";
import { phrasePattern } from "../../matching/words.ts";
import { type CsvRow, readCsv } from "../../sources/csv.ts";

const availabilities = ["Stock Present", "Low Stock", "No Stock"];

const specColumns: [SpecName, string][] = [
  ["color", "Color"],
  ["chipset", "Chipset"],
  ["storage", "Storage"],
  ["generation", "Generation"],
  ["size", "Size"],
  ["material", "CaseMaterial"],
];

const priceColumns = [
  "RetailPrice",
  "PromotionPrice",
  "LastMonthPrice",
  "XOXBundlePrice",
];

export interface StockItem extends Device {
  row: CsvRow;
  availability: string;
  stores: string[];
  videos: string[];
  checkoutLink?: string;
}

export type Stock = Catalogue<StockItem>;

export function readStock(text: string): Stock {
  const rows = readCsv(text, [
    "Category",
    "Model",
    "Condition",
    "RAM",
    "CheckoutLink",
    "VideoLink",
    "PortraitVideo",
    "Nostockatall",
    "StoreLookup",
    ...specColumns.map(([, column]) => column),
    ...priceColumns,
  ]);
  return buildCatalogue(
    rows
      .filter((row) => availabilities.includes(row.Nostockatall ?? ""))
      .map(readItem),
  );
}

function readItem(row: CsvRow): StockItem {
  const title = row.Model ?? "";
  return {
    category: (row.Category ?? "").replace(/^[NU]_/, "").replace(/_WC$/, ""),
    model: catalogueModel(title, row),
    specs: readSpecs(title, row),
    row,
    availability: row.Nostockatall ?? "",
    stores: (row.StoreLookup ?? "")
      .split(", ")
      .map((store) => store.replace(/^@/, "").trim())
      .filter(Boolean),
    videos: [...new Set([link(row.VideoLink), link(row.PortraitVideo)])].filter(
      (video) => video !== undefined,
    ),
    checkoutLink: link(row.CheckoutLink),
  };
}

function readSpecs(title: string, row: CsvRow): Specs {
  const specs = readGenericSpecs(title).specs;
  for (const [name, column] of specColumns) {
    const value = normalizeSpec(name, row[column]);
    if (value) specs[name] = value;
  }
  specs.condition = row.Condition?.toUpperCase() === "NEW" ? "new" : "used";
  return specs;
}

/** The title without the row's own specification values and the words that generic patterns recognize. */
function catalogueModel(title: string, row: CsvRow): string {
  let model = readGenericSpecs(title).rest;
  const values = [...specColumns.map(([, column]) => row[column]), row.RAM];
  const numbers = [row.Generation, row.Size].map(
    (value) => /\d+(?:\.\d+)?/.exec(value ?? "")?.[0],
  );
  for (const value of [...values, ...numbers]) {
    if (value) model = model.replace(phrasePattern(value, "ig"), " ");
  }
  return model;
}

function link(value: string | undefined): string | undefined {
  return value && value !== "0" ? value : undefined;
}
