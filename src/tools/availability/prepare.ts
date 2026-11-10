import { z } from "zod";

import { describeProduct } from "../../matching/describe.ts";
import { type CsvRow, parseCsv } from "../../sources/csv.ts";
import type { StockRow } from "./stock.ts";

const specColumns = {
  color: "Color",
  storage: "Storage",
  size: "Size",
  chipset: "Chipset",
  connectivity: "Connectivity",
  material: "CaseMaterial",
  generation: "Generation",
  year: "Year",
  ram: "RAM",
} as const;

type SpecColumn = keyof typeof specColumns;
const specNames = Object.keys(specColumns) as SpecColumn[];

const column = z.string().min(1);
const mappingsSchema = z.object({
  products: z.record(
    z.string(),
    z.object({
      category: column,
      specs: z.partialRecord(z.enum(specNames), z.string()).default({}),
    }),
  ),
  branches: z.array(z.object({ column, name: column })),
  prices: z
    .array(
      z.object({ column, name: column, monthly: z.boolean().default(false) }),
    )
    .default([]),
});

type StockMappings = z.infer<typeof mappingsSchema>;

export const parseStockMappings = (json: unknown) => mappingsSchema.parse(json);

// The source writes these words where it has no value.
const raw = (value: string | undefined) =>
  ["N/A", "Ask Store"].includes(value?.trim() ?? "") ? "" : (value ?? "");
const clean = (value: string | undefined) => raw(value).trim();

// Quantities compare as text, as the source sheet does: "4" and "30" sort after "3", but "10" does not.
function availability(quantity: string) {
  if (quantity > "3") return "Stock Present";
  return quantity === "0" ? "Out of Stock" : "Low Stock";
}

type Product = StockMappings["products"][string];

function specValues(row: CsvRow, name: string, product: Product) {
  const supplied = Object.fromEntries(
    specNames.map((key) => [key, clean(row[specColumns[key]])]),
  ) as Record<SpecColumn, string>;
  const { model, specs } = describeProduct(name, supplied);
  const values = Object.fromEntries(
    specNames.map((key) => [key, product.specs[key] ?? specs[key] ?? ""]),
  ) as Record<SpecColumn, string>;
  return { model, ...values };
}

function toStockRow(
  row: CsvRow,
  mappings: StockMappings,
): StockRow | undefined {
  const product = mappings.products[row.Category ?? ""];
  const name = clean(row.Model);
  if (!product || !name) return undefined;
  return {
    category: product.category,
    ...specValues(row, name, product),
    condition: clean(row.Condition).toLowerCase() === "new" ? "New" : "Used",
    availability: availability(raw(row.TotalStock)),
    retailPrice: clean(row.RetailPrice),
    promotionPrice: clean(row.PromotionPrice),
    lastMonthPrice: clean(row.LastMonthPrice),
    otherPrices: mappings.prices
      .map(({ column, name, monthly }) => ({
        name,
        amount: clean(row[column]),
        monthly,
      }))
      .filter((price) => price.amount),
    checkoutLink: clean(row.CheckoutLink),
    videoLinks: clean(row.VideoLink)
      .split(",")
      .map((link) => link.trim())
      .filter((link) => link && link !== "0"),
    stores: mappings.branches
      .filter((branch) => raw(row[branch.column]) !== "0")
      .map((branch) => branch.name),
  };
}

export function prepareStock(text: string, mappings: StockMappings) {
  const rows = parseCsv(
    text,
    [
      "Category",
      "Model",
      "Condition",
      "TotalStock",
      "RetailPrice",
      ...mappings.branches.map((b) => b.column),
      ...mappings.prices.map((p) => p.column),
    ],
    (name) => name.replace(/\s/g, ""),
  );
  return rows.flatMap((row) => toStockRow(row, mappings) ?? []);
}
