import { parseCsv } from "../../sources/csv.ts";

export const referenceColumns = [
  "Category",
  "Model",
  "Generation",
  "ModelNumber",
  "Size",
  "Storage",
  "Year",
  "Chipset",
  "Material",
  "Connectivity",
  "TradeinPrice",
] as const;

export const variantSpecs = [
  "storage",
  "size",
  "chipset",
  "generation",
  "connectivity",
  "material",
  "year",
] as const;

export function parseReference(text: string) {
  return parseCsv(text, ["Category", "Model"]).map((row) => {
    const cell = (name: string) => row[name] ?? "";
    return {
      category: cell("Category"),
      model: cell("Model"),
      modelNumber: cell("ModelNumber"),
      generation: cell("Generation"),
      size: cell("Size"),
      storage: cell("Storage"),
      year: cell("Year"),
      chipset: cell("Chipset"),
      material: cell("Material"),
      connectivity: cell("Connectivity"),
      // An absent price is zero. A blank price stays blank.
      value: row.TradeinPrice ?? "0",
    };
  });
}

export type Variant = ReturnType<typeof parseReference>[number];
