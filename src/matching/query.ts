export const specKeys = [
  "storage",
  "color",
  "size",
  "chipset",
  "connectivity",
  "material",
  "generation",
  "year",
  "condition",
] as const;

type SpecKey = (typeof specKeys)[number];
export type Specs = Partial<Record<SpecKey, string>>;
type ParsedQuery = Specs & {
  category?: string;
  model?: string;
  modelNumber?: string;
};

const appleCategories = new Set([
  "Mac",
  "iPad",
  "iPhone",
  "Apple Watch",
  "AirPods",
]);

// Order matters: the first pattern that occurs gives the category. A sub-line keyword stays in the model.
const categories: [RegExp, string, "subline"?][] = [
  [/macbook/i, "Mac", "subline"],
  [/imac/i, "Mac", "subline"],
  [/mac\s*mini/i, "Mac", "subline"],
  [/\bmac\b/i, "Mac"],
  [/apple\s*watch/i, "Apple Watch"],
  [/airpods/i, "AirPods"],
  [/ipad/i, "iPad"],
  [/iphone/i, "iPhone"],
  [/google\s*pixel|pixel/i, "Pixel"],
  [/samsung\s*galaxy|galaxy|samsung/i, "Samsung"],
  [/honor/i, "HONOR"],
  [/oppo/i, "OPPO"],
  [/vivo/i, "Vivo"],
  [/playstation|ps5|ps4/i, "PlayStation"],
  [/nintendo\s*switch|nintendo|switch/i, "Switch"],
];

const colors = [
  "Alpine Green",
  "Black",
  "Black Titanium",
  "Blue",
  "Blue Shadow",
  "Blue Titanium",
  "Cloud White",
  "Coralred",
  "Cosmic Orange",
  "Dark Green",
  "Deep Blue",
  "Deep Purple",
  "Desert Titanium",
  "Gold",
  "Graphite",
  "Green",
  "Hazel",
  "Icyblue",
  "Jetblack",
  "Lavender",
  "Light Gold",
  "Midnight",
  "Midnight Green",
  "Mint",
  "Mist Blue",
  "Natural Titanium",
  "Navy",
  "Obsidian",
  "Pacific Blue",
  "Pink",
  "Porcelain",
  "Purple",
  "Red",
  "Rose Quartz",
  "Sage",
  "Sierra Blue",
  "Silver",
  "Silver Shadow",
  "Sky Blue",
  "Space Black",
  "Space Gray",
  "Starlight",
  "Teal",
  "Titanium Black",
  "Titanium Gray",
  "Titanium Silverblue",
  "Titanium Whitesilver",
  "Ultramarine",
  "Violet",
  "White",
  "White Titanium",
  "Yellow",
].sort((a, b) => b.length - a.length);

export const ordinal = (n: number) => {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ??
        "th");
  return `${n}${suffix}`;
};

function connectivity(match: RegExpExecArray, category?: string) {
  const [, base, cellular, alone] = match;
  if (base) {
    const name = /gps/i.test(base) ? "GPS" : "WiFi";
    return cellular ? `${name}+Cellular` : name;
  }
  return alone && category === "Apple Watch" ? "GPS+Cellular" : "WiFi+Cellular";
}

type Extractor = {
  key: SpecKey;
  pattern: RegExp;
  value: (match: RegExpExecArray, category?: string) => string;
  only?: (category?: string) => boolean;
};

// Colors come before materials, so that "Natural Titanium" is a color and not a material.
const extractors: Extractor[] = [
  {
    key: "storage",
    pattern: /\b(\d+)\s*(gb|tb)\b(?!\s*(?:ram|memory|unified))/gi,
    value: (m) => `${m[1]}${m[2]!.toUpperCase()}`,
  },
  {
    key: "size",
    pattern: /\b(\d+(?:\.\d+)?)\s*(?:-?\s*inch(?:es)?\b|["”])/gi,
    value: (m) => `${m[1]}"`,
  },
  { key: "size", pattern: /\b(\d{2})\s*mm\b/gi, value: (m) => `${m[1]}MM` },
  {
    key: "chipset",
    pattern: /\b(M\d(?:\s+(?:pro|max|ultra))?|A\d{1,2}[XZ]?)\b/gi,
    value: (m) => m[1]!.replace(/\s+/g, " ").toUpperCase(),
    only: (category) => appleCategories.has(category ?? ""),
  },
  {
    key: "connectivity",
    pattern:
      /\b(wi-?fi|gps)(?:\s*(?:\+|&|and|plus)?\s*(cellular|lte|4g|5g))?\b|\b(cellular|lte|4g|5g)\b/gi,
    value: connectivity,
  },
  {
    key: "condition",
    pattern: /\b(used|new|refurbished|pre-?\s?owned|second-?\s?hand)\b/gi,
    value: (m) => (m[1]!.toLowerCase() === "new" ? "New" : "Used"),
  },
  {
    key: "color",
    pattern: new RegExp(`\\b(${colors.join("|")})\\b`, "gi"),
    value: (m) => colors.find((c) => c.toLowerCase() === m[1]!.toLowerCase())!,
  },
  {
    key: "material",
    pattern: /\b(alumini?um|titanium|stainless\s*steel)\b/gi,
    value: (m) =>
      /titanium/i.test(m[1]!)
        ? "Titanium"
        : /stainless/i.test(m[1]!)
          ? "Stainless Steel"
          : "Aluminium",
  },
  {
    key: "generation",
    pattern: /\b(\d{1,2})\s*(?:st|nd|rd|th)\b(?:\s*gen(?:eration)?\b)?/gi,
    value: (m) => ordinal(Number(m[1])),
  },
  { key: "year", pattern: /\b(20\d{2})\b/g, value: (m) => m[1]! },
];

type Span = [number, number];
const span = (m: RegExpExecArray): Span => [m.index, m.index + m[0].length];

function extractSpecs(text: string, category: string | undefined) {
  const specs: Specs = {};
  const consumed: Span[] = [];
  const free = (m: RegExpExecArray) => {
    const [from, to] = span(m);
    return !consumed.some(([start, end]) => from < end && start < to);
  };
  for (const extractor of extractors) {
    if (specs[extractor.key] || (extractor.only && !extractor.only(category)))
      continue;
    const match = [...text.matchAll(extractor.pattern)].find(free);
    if (!match) continue;
    specs[extractor.key] = extractor.value(match, category);
    consumed.push(span(match));
  }
  return { specs, consumed };
}

function remainder(text: string, consumed: Span[]) {
  let rest = text;
  for (const [start, end] of consumed.sort((a, b) => b[0] - a[0]))
    rest = rest.slice(0, start) + " " + rest.slice(end);
  return rest
    .replace(/\bgen(?:eration)?\b/gi, " ")
    .replace(/[()[\]{},+&/|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "");
}

// For an iPad with no other size or generation, a whole number up to 10 is a generation, and other numbers are sizes.
function ipadNumber(query: ParsedQuery) {
  if (
    query.category !== "iPad" ||
    !query.model ||
    query.size ||
    query.generation
  )
    return;
  const match = /\b(\d+(?:\.\d+)?)\b/.exec(query.model);
  if (!match) return;
  const value = Number(match[1]);
  if (Number.isInteger(value) && value <= 10) query.generation = ordinal(value);
  else query.size = `${match[1]}"`;
  query.model = remainder(query.model, [span(match)]) || undefined;
}

function findCategory(text: string) {
  for (const [pattern, category, subline] of categories) {
    const match = pattern.exec(text);
    if (match) return { category, keyword: match[0], subline: !!subline };
  }
}

const words = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

// A model that only names the whole category is a broad search. Without a category, the rest is no model.
function modelName(model: string, found: ReturnType<typeof findCategory>) {
  if (!found || !model) return undefined;
  return !found.subline && words(model) === words(found.keyword)
    ? undefined
    : model;
}

export function parseQuery(text: string): ParsedQuery | undefined {
  const query = text.trim();
  const number = /\bA\d{4}\b/i.exec(query);
  const found = findCategory(query);
  if (!found && !number) return undefined;
  const { specs, consumed } = extractSpecs(query, found?.category);
  if (number) consumed.push(span(number));
  const result: ParsedQuery = {
    ...specs,
    category: found?.category,
    model: modelName(remainder(query, consumed), found),
    modelNumber: number?.[0].toUpperCase(),
  };
  ipadNumber(result);
  return result;
}
