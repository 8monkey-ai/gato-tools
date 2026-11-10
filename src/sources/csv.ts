import { parse } from "csv-parse/sync";

export type CsvRow = Partial<Record<string, string>>;

export function parseCsv(
  text: string,
  required: readonly string[],
  header = (name: string) => name,
): CsvRow[] {
  if (!text.trim()) return [];
  return parse<CsvRow>(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    columns: (names: string[]) => {
      const columns = names.map(header);
      const missing = required.filter((name) => !columns.includes(name));
      if (missing.length)
        throw new Error(`Missing columns: ${missing.join(", ")}`);
      return columns;
    },
  });
}
