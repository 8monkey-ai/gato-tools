export type SpecName =
  | "condition"
  | "color"
  | "storage"
  | "size"
  | "chipset"
  | "connectivity"
  | "material"
  | "generation"
  | "year";

/** Specification values in their compared form, see normalizeSpec. */
export type Specs = Partial<Record<SpecName, string>>;

// Order matters: a memory value is removed before storage, and WiFi or GPS before cellular alone.
const genericPatterns: [
  SpecName | undefined,
  RegExp,
  (m: RegExpExecArray) => string,
][] = [
  [
    undefined,
    /\b\d+\s*gb\s*(?:of\s+)?(?:unified\s+)?(?:ram|memory)\b/i,
    () => "",
  ],
  ["storage", /\b(\d+)\s*(gb|tb)\b/i, (m) => `${m[1]}${m[2]}`.toLowerCase()],
  [
    "size",
    /(?<![\w.])(\d+(?:\.\d+)?)\s*(mm\b|(?:\s*(?:["”″]|''|-?\s*inch(?:es)?\b))+)/i,
    readSize,
  ],
  ["year", /\b(?:19|20)\d{2}\b/, (m) => m[0]],
  [
    "generation",
    /\b(\d+)(?:st|nd|rd|th)\b(?:\s*gen(?:eration)?\b)?/i,
    (m) => String(Number(m[1])),
  ],
  [
    "condition",
    /\b(?:used|refurbished|refurb|pre-?owned|second-?\s?hand)\b/i,
    () => "used",
  ],
  ["condition", /\b(?:brand\s+)?new\b/i, () => "new"],
  [
    "connectivity",
    /\b(wi-?fi|gps)(?:\s*(?:\+|&|and|\/)?\s*(cellular|lte|4g|5g))?\b/i,
    readConnectivity,
  ],
  ["connectivity", /\b(?:cellular|lte|4g|5g)\b/i, () => "cellular"],
];

/** Reads the specifications that generic patterns recognize, and gives the text without them. */
export function readGenericSpecs(text: string): { specs: Specs; rest: string } {
  const specs: Specs = {};
  let rest = text;
  for (const [name, pattern, read] of genericPatterns) {
    const global = new RegExp(pattern.source, `${pattern.flags}g`);
    rest = rest.replace(global, (whole: string) => {
      const match = pattern.exec(whole);
      if (name && match) specs[name] = keep(name, specs[name], read(match));
      return " ";
    });
  }
  return { specs, rest };
}

/** Gives the compared form of a catalogue or request value, or undefined for a blank value. */
export function normalizeSpec(
  name: SpecName,
  value: string | undefined,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (name === "size" && /^\d+(\.\d+)?$/.test(text)) return `${Number(text)}"`;
  return (
    readGenericSpecs(text).specs[name] ??
    text.toLowerCase().replace(/\s+/g, " ")
  );
}

export function specMatches(
  name: SpecName,
  wanted: string,
  have: string | undefined,
): boolean {
  if (!have) return true;
  if (name === "color") return ` ${have} `.includes(` ${wanted} `);
  if (name === "connectivity" && wanted === "cellular")
    return have.endsWith("cellular");
  return have === wanted;
}

// A memory value without "RAM" is smaller than the storage, so the larger value is the storage.
function keep(name: SpecName, first: string | undefined, next: string): string {
  if (!first) return next;
  return name === "storage" && storageSize(next) > storageSize(first)
    ? next
    : first;
}

function storageSize(value: string): number {
  return Number.parseInt(value) * (value.endsWith("tb") ? 1024 : 1);
}

function readSize(match: RegExpExecArray): string {
  const unit = match[2]?.toLowerCase().startsWith("mm") ? "mm" : '"';
  return `${Number(match[1])}${unit}`;
}

function readConnectivity(match: RegExpExecArray): string {
  const base = match[1]?.toLowerCase().startsWith("gps") ? "gps" : "wifi";
  return match[2] ? `${base}+cellular` : base;
}
