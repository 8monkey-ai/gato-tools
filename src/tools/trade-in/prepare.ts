import { stringify } from "csv-stringify/sync";

import { describeProduct } from "../../matching/describe.ts";
import { ordinal } from "../../matching/query.ts";
import { type CsvRow, parseCsv } from "../../sources/csv.ts";
import { referenceColumns } from "./reference.ts";

// The closed set of categories in the Malaysian trade-in export.
const categories: Record<string, string> = {
  macbook: "Mac",
  pad: "iPad",
  phone: "iPhone",
  samsung: "Samsung",
};

const generation = (value: string) =>
  /^\d+$/.test(value) ? ordinal(Number(value)) : value;

function toVariant(row: CsvRow) {
  const cell = (name: string) => row[name]?.trim() ?? "";
  const category = categories[cell("Category").toLowerCase()];
  const name = cell("ModelName");
  if (!category || !name) return [];
  const { model, specs } = describeProduct(name, {
    generation: generation(cell("Generation")),
    size: cell("Display").replace(/-inch$/i, '"'),
    storage: cell("Storage"),
    year: cell("Year"),
    chipset: cell("Chipset"),
  });
  const spec = (key: keyof typeof specs) => specs[key] ?? "";
  return [
    {
      Category: category,
      Model: model,
      Generation: spec("generation"),
      ModelNumber: cell("ModelNumber").replace(/\s/g, ""),
      Size: spec("size"),
      Storage: spec("storage"),
      Year: spec("year"),
      Chipset: spec("chipset"),
      Material: spec("material"),
      Connectivity: spec("connectivity"),
      TradeinPrice: cell("Price"),
    },
  ];
}

export function prepareTradeIn(text: string) {
  const rows = parseCsv(text, ["Category", "ModelName", "Price"], (name) =>
    name.replace(/\s/g, ""),
  );
  return stringify(rows.flatMap(toVariant), {
    header: true,
    columns: [...referenceColumns],
  });
}
