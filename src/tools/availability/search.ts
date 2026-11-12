import {
  devicesOf,
  matchesQuery,
  type Query,
} from "../../matching/catalogue.ts";
import type { SpecName } from "../../matching/specs.ts";
import { isNumber } from "../../matching/words.ts";
import type { Stock, StockItem } from "./stock.ts";

export interface StockRequest {
  query?: Query;
  inPromo: boolean;
  budget?: [number, number];
  order: "asc" | "desc";
}

export type StockMatch = Stock["groups"][number]["devices"][number];

export interface StockResult {
  items: StockMatch[];
  droppedFilters: string[];
  substitution?: "newer" | "older";
}

type Attempt = Omit<StockRequest, "order"> & { report: string[] };

const relaxable: SpecName[] = [
  "condition",
  "color",
  "storage",
  "size",
  "chipset",
  "connectivity",
];

/** Runs the search of SPECS.md section 2. Gives undefined for the no-match outcome. */
export function searchStock(
  stock: Stock,
  request: StockRequest,
): StockResult | undefined {
  const found = findRelaxed(stock, request, false);
  const available = found && {
    ...found,
    items: found.items.filter(isAvailable),
  };
  const chosen = available?.items.length
    ? available
    : (substitute(stock, request, found?.items[0]) ?? found);
  return chosen && { ...chosen, items: arrange(chosen.items, request.order) };
}

function substitute(
  stock: Stock,
  request: StockRequest,
  first: StockMatch | undefined,
) {
  for (const [step, substitution] of [
    [1, "newer"],
    [-1, "older"],
  ] as const) {
    const query = nextQuery(request.query, first, step);
    const found = query && findRelaxed(stock, { ...request, query }, true);
    if (found) return { ...found, substitution };
  }
  return undefined;
}

function findRelaxed(
  stock: Stock,
  request: Omit<StockRequest, "order">,
  onlyAvailable: boolean,
) {
  const pool = (
    request.query
      ? devicesOf(stock, request.query.categories)
      : stock.groups.flatMap((g) => g.devices)
  ).filter((item) => !onlyAvailable || isAvailable(item));
  for (const attempt of attempts(request)) {
    const items = pool.filter((item) => satisfies(item, attempt));
    if (items.length) return { items, droppedFilters: attempt.report };
  }
  return undefined;
}

function* attempts(request: Omit<StockRequest, "order">): Generator<Attempt> {
  let current: Attempt = { ...request, report: [] };
  yield current;
  for (const name of relaxable) {
    const query = current.query;
    if (!query?.specs[name]) continue;
    const specs = { ...query.specs };
    delete specs[name];
    current = { ...current, query: { ...query, specs }, report: [name] };
    yield current;
  }
  if (current.budget) {
    const [low, high] = current.budget;
    for (const widen of [250, 500]) {
      const budget: [number, number] = [Math.max(0, low - widen), high + widen];
      yield {
        ...current,
        budget,
        report: [`price_range widened to ${budget.join("-")}`],
      };
    }
    current = { ...current, budget: undefined, report: ["price_range"] };
    yield current;
  }
  if (current.inPromo)
    yield {
      ...current,
      inPromo: false,
      report: [...(request.budget ? ["price_range"] : []), "in_promo"],
    };
}

function satisfies(
  item: StockMatch,
  { query, inPromo, budget }: Attempt,
): boolean {
  if (query && !matchesQuery(item, query)) return false;
  if (inPromo && !item.row.PromotionPrice) return false;
  if (!budget) return true;
  const price = item.row.PromotionPrice || item.row.RetailPrice || "";
  return (
    /^\d+$/.test(price) &&
    Number(price) >= budget[0] &&
    Number(price) <= budget[1]
  );
}

/** The next model has the next generation, year, or model number of the request, else of the first match. */
function nextQuery(
  query: Query | undefined,
  first: StockMatch | undefined,
  step: number,
): Query | undefined {
  const own = query && shiftQuery(query, query.specs, query.model, step);
  if (own || !first) return own;
  const base = query ?? { categories: [first.category], specs: {} };
  return shiftQuery(
    { ...base, categories: [first.category] },
    first.specs,
    first.modelWords,
    step,
  );
}

function shiftQuery(
  base: Query,
  specs: Query["specs"],
  model: string[] | undefined,
  step: number,
) {
  for (const name of ["generation", "year"] as const) {
    const value = specs[name];
    if (value)
      return {
        ...base,
        specs: { ...base.specs, [name]: String(Number(value) + step) },
      };
  }
  const index = model?.findLastIndex((word) => isNumber(word)) ?? -1;
  const number = Number(model?.[index]);
  if (!model || index < 0 || !Number.isInteger(number) || number + step < 0)
    return undefined;
  return { ...base, model: model.with(index, String(number + step)) };
}

function isAvailable(item: StockItem): boolean {
  return (
    item.availability === "Stock Present" || item.availability === "Low Stock"
  );
}

function arrange(items: StockMatch[], order: "asc" | "desc"): StockMatch[] {
  const direction = order === "asc" ? 1 : -1;
  return items
    .filter((item) => price(item.row.RetailPrice) !== undefined)
    .toSorted(
      (a, b) =>
        Number(isAvailable(b)) - Number(isAvailable(a)) ||
        direction * (sortPrice(a) - sortPrice(b)),
    )
    .slice(0, 10);
}

function sortPrice(item: StockItem): number {
  return price(item.row.PromotionPrice) ?? price(item.row.RetailPrice) ?? 0;
}

function price(text: string | undefined): number | undefined {
  return text && Number.isFinite(Number(text)) ? Number(text) : undefined;
}
