import { modelMatches, specsMatch } from "../../matching/model.ts";
import { ordinal, specKeys, type Specs } from "../../matching/query.ts";
import type { StockRow } from "./stock.ts";

export type Budget = { min: number; max: number };
type Filters = Specs & {
  category?: string;
  model?: string;
  promotionOnly?: boolean;
  budget?: Budget;
};
export type Order = "desc" | "asc";
type Found = { found: StockRow[]; dropped: string[] };

const listed = ["stock present", "low stock", "out of stock"];
const inStock = (row: StockRow) =>
  ["stock present", "low stock"].includes(row.availability.toLowerCase());
const whole = (text: string) => (/^\d+$/.test(text) ? Number(text) : undefined);
const numeric = (text: string) =>
  /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;

function budgetPrice(row: StockRow) {
  return whole(row.promotionPrice) ?? whole(row.retailPrice);
}

function inBudget(row: StockRow, budget: Budget | undefined) {
  if (!budget) return true;
  const price = budgetPrice(row);
  return price !== undefined && price >= budget.min && price <= budget.max;
}

function matches(row: StockRow, filters: Filters) {
  return (
    listed.includes(row.availability.toLowerCase()) &&
    (!filters.category ||
      row.category.toLowerCase() === filters.category.toLowerCase()) &&
    specsMatch(filters, row, specKeys) &&
    (!filters.model || modelMatches(filters.model, row.model)) &&
    (!filters.promotionOnly || !!row.promotionPrice) &&
    inBudget(row, filters.budget)
  );
}

const relaxable = [
  ["condition", "condition"],
  ["color", "color"],
  ["storage", "storage"],
  ["size", "size"],
  ["chipset", "chipset"],
  ["connectivity", "connectivity"],
  ["budget", "budget"],
  ["promotionOnly", "promotion_only"],
] as const;

// Each step names the removal that gives it, and the budget relaxation once the search has tried it.
function* relaxations(start: Filters) {
  let filters = start;
  let budgetTried = false;
  yield { filters, report: [] as string[] };
  for (const [key, name] of relaxable) {
    const { budget } = filters;
    if (!filters[key]) continue;
    if (key === "budget" && budget) {
      budgetTried = true;
      for (const step of [250, 500]) {
        const widened = {
          min: Math.max(0, budget.min - step),
          max: budget.max + step,
        };
        yield { filters: { ...filters, budget: widened }, report: ["budget"] };
      }
    }
    filters = { ...filters, [key]: undefined };
    yield {
      filters,
      report: budgetTried && key !== "budget" ? ["budget", name] : [name],
    };
  }
}

function relaxedSearch(
  rows: StockRow[],
  start: Filters,
  keep = (_: StockRow) => true,
): Found {
  for (const { filters, report } of relaxations(start)) {
    const found = rows.filter((row) => matches(row, filters) && keep(row));
    if (found.length) return { found, dropped: report };
  }
  return { found: [], dropped: [] };
}

function shiftOrdinal(text: string, offset: number) {
  const match = /^(\d+)/.exec(text);
  const n = match ? Number(match[1]) + offset : 0;
  return n > 0 ? ordinal(n) : undefined;
}

// The model name gives the next model through its generation, or its last number below 100 that is not a year.
function shiftModel(model: string, offset: number) {
  const generation = /\b(\d+)(?:st|nd|rd|th)\b/i.exec(model);
  const numbers = [...model.matchAll(/\d+/g)].filter(
    (m) => !/^20\d\d$/.test(m[0]) && Number(m[0]) > 0 && Number(m[0]) < 100,
  );
  const target = generation ?? numbers.at(-1);
  if (!target) return undefined;
  const shifted = generation
    ? shiftOrdinal(target[0], offset)
    : String(Number(target[0]) + offset);
  if (!shifted) return undefined;
  return (
    model.slice(0, target.index) +
    shifted +
    model.slice(target.index + target[0].length)
  );
}

const shiftYear = (year: string, offset: number) =>
  whole(year) === undefined ? undefined : String(Number(year) + offset);

function neighbor(
  filters: Filters,
  sample: StockRow,
  offset: number,
): Filters | undefined {
  const target = {
    generation: shiftOrdinal(filters.generation || sample.generation, offset),
    year: shiftYear(filters.year || sample.year, offset),
    model: shiftModel(filters.model || sample.model, offset),
  };
  if (!target.generation && !target.year && !target.model) return undefined;
  return { ...filters, ...target, model: target.model ?? filters.model };
}

function substitute(rows: StockRow[], filters: Filters, sample: StockRow) {
  for (const [substitution, offset] of [
    ["newer", 1],
    ["older", -1],
  ] as const) {
    const target = neighbor(filters, sample, offset);
    const alternative = target && relaxedSearch(rows, target, inStock);
    if (alternative?.found.length) return { ...alternative, substitution };
  }
}

function arrange(rows: StockRow[], order: Order) {
  const price = (row: StockRow) =>
    numeric(row.promotionPrice) ?? numeric(row.retailPrice) ?? 0;
  const direction = order === "asc" ? 1 : -1;
  return rows
    .filter((row) => numeric(row.retailPrice) !== undefined)
    .sort(
      (a, b) =>
        Number(inStock(b)) - Number(inStock(a)) ||
        direction * (price(a) - price(b)),
    )
    .slice(0, 10);
}

export function searchStock(rows: StockRow[], filters: Filters, order: Order) {
  const category = filters.category?.toLowerCase();
  if (category && !rows.some((row) => row.category.toLowerCase() === category))
    return { outcome: "not_in_catalogue" as const };
  const first = relaxedSearch(rows, filters);
  const [sample] = first.found;
  if (!sample) return { outcome: "no_match" as const };
  const available = first.found.filter(inStock);
  const chosen = available.length
    ? { found: available, dropped: first.dropped, substitution: undefined }
    : (substitute(rows, filters, sample) ?? {
        ...first,
        substitution: undefined,
      });
  return {
    outcome: "found" as const,
    devices: arrange(chosen.found, order),
    dropped: chosen.dropped,
    substitution: chosen.substitution,
  };
}
