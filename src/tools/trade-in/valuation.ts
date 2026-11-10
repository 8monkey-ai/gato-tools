import { modelMatches, specsMatch } from "../../matching/model.ts";
import { parseQuery } from "../../matching/query.ts";
import { type Variant, variantSpecs } from "./reference.ts";

type Valuation =
  | {
      outcome:
        | "not_recognized"
        | "empty_reference"
        | "unsupported_category"
        | "no_match"
        | "too_broad";
    }
  | { outcome: "found"; variants: Variant[] };

function matching(variants: Variant[], description: string) {
  const query = parseQuery(description);
  if (!query) return "not_recognized" as const;
  if (!variants.length) return "empty_reference" as const;
  const { modelNumber, category } = query;
  if (modelNumber)
    return variants.filter((v) =>
      v.modelNumber.toLowerCase().includes(modelNumber.toLowerCase()),
    );
  const same = (v: Variant) =>
    v.category.toLowerCase() === category!.toLowerCase();
  if (!variants.some(same)) return "unsupported_category" as const;
  return variants.filter(
    (v) =>
      same(v) &&
      (!query.model || modelMatches(query.model, v.model)) &&
      specsMatch(query, v, variantSpecs),
  );
}

export function valueDevice(
  variants: Variant[],
  description: string,
): Valuation {
  const found = matching(variants, description);
  if (typeof found === "string") return { outcome: found };
  if (!found.length) return { outcome: "no_match" };
  if (found.length > 10) return { outcome: "too_broad" };
  const year = (v: Variant) => Number.parseInt(v.year, 10) || 0;
  return {
    outcome: "found",
    variants: found.sort((a, b) => year(b) - year(a)),
  };
}
