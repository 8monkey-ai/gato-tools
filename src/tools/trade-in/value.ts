import {
  devicesOf,
  type Entry,
  matchesQuery,
  readDescription,
} from "../../matching/catalogue.ts";
import type { Reference, Variant } from "./reference.ts";

export type Match = Entry<Variant>;

/**
 * Gives the reference variants that a description matches, or undefined when the description is not recognized.
 * A model number takes precedence over the other preferences. Color and condition do not change the value.
 */
export function findVariants(
  reference: Reference,
  description: string,
): Match[] | undefined {
  const query = readDescription(reference, description);
  if (!query) return undefined;
  const { modelNumber } = query;
  const devices = devicesOf(reference);
  if (modelNumber)
    return devices.filter((device) =>
      device.row.ModelNumber?.toUpperCase().includes(modelNumber),
    );
  const { color, condition, ...specs } = query.specs;
  return devices.filter((device) => matchesQuery(device, { ...query, specs }));
}

/** Newest year first. A missing year sorts as zero. */
export function newestFirst(variants: Match[]): Match[] {
  const year = (variant: Match) => Number(variant.specs.year ?? 0);
  return variants.toSorted((a, b) => year(b) - year(a));
}
