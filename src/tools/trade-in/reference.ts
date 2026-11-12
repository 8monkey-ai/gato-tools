import {
  buildCatalogue,
  type Catalogue,
  type Device,
} from "../../matching/catalogue.ts";
import {
  normalizeSpec,
  type SpecName,
  type Specs,
} from "../../matching/specs.ts";
import { type CsvRow, readCsv } from "../../sources/csv.ts";

export const specColumns: [SpecName, string][] = [
  ["generation", "Generation"],
  ["size", "Size"],
  ["storage", "Storage"],
  ["year", "Year"],
  ["chipset", "Chipset"],
  ["material", "Material"],
  ["connectivity", "Connectivity"],
];

export interface Variant extends Device {
  row: CsvRow;
  /** Undefined when the reference gives a blank price. */
  price?: string;
}

export type Reference = Catalogue<Variant>;

export function readReference(text: string): Reference {
  const rows = readCsv(text, [
    "Category",
    "Model",
    "ModelNumber",
    "TradeinPrice",
    ...specColumns.map(([, column]) => column),
  ]);
  return buildCatalogue(rows.map(readVariant));
}

function readVariant(row: CsvRow): Variant {
  const specs: Specs = {};
  for (const [name, column] of specColumns) {
    const value = normalizeSpec(name, row[column]);
    if (value) specs[name] = value;
  }
  return {
    category: row.Category ?? "",
    model: row.Model ?? "",
    specs,
    row,
    price: row.TradeinPrice === undefined ? "0" : row.TradeinPrice || undefined,
  };
}
