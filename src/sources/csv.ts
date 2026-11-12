import { parse } from "csv-parse/sync";

export type CsvRow = Record<string, string | undefined>;

const fillers = new Set(["n/a", "ask store"]);

/**
 * Reads a sheet export. Header names lose their spaces, line breaks, and byte order mark.
 * Filler cells read as blank. A cell that a short row does not have stays absent.
 */
export function readCsv(text: string, requiredColumns: string[]): CsvRow[] {
  let header: string[] = [];
  const rows: CsvRow[] = parse(text, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
    columns: (names: string[]) =>
      (header = names.map((name) => name.replace(/[\s\uFEFF]/g, ""))),
    cast: (value) => {
      const cell = value.trim();
      return fillers.has(cell.toLowerCase()) ? "" : cell;
    },
  });
  const missing = requiredColumns.filter((name) => !header.includes(name));
  if (missing.length) throw new Error(`missing columns: ${missing.join(", ")}`);
  return rows;
}
