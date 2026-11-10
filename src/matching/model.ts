import { distance } from "fastest-levenshtein";

import type { Specs } from "./query.ts";

const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const numbers = (text: string) =>
  [...new Set(text.match(/\d+/g) ?? [])].sort().join(",");

const isPrefix = (start: string[], all: string[]) =>
  start.length <= all.length && start.every((token, i) => all[i] === token);

function similar(a: string, b: string) {
  if (numbers(a) !== numbers(b)) return false;
  return 1 - distance(a, b) / Math.max(a.length, b.length, 1) >= 0.85;
}

// A request without a number names a family. It matches the numbered models of that family and its sub-lines, but not a sibling line.
export function modelMatches(request: string, catalogue: string) {
  const asked = tokens(request);
  const numbered = /\d/.test(request);
  const known = tokens(numbered ? catalogue : catalogue.replace(/\d+/g, " "));
  if (!asked.length) return false;
  if (known.every((token) => asked.includes(token))) return true;
  if (!numbered && isPrefix(asked, known)) return true;
  return similar(asked.join(" "), tokens(catalogue).join(" "));
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// A blank value on either side does not exclude a match. A color can match a longer catalogue color.
export function specsMatch(
  requested: Specs,
  catalogue: Specs,
  keys: readonly (keyof Specs)[],
) {
  return keys.every((key) => {
    const asked = requested[key];
    const known = catalogue[key];
    if (!asked || !known) return true;
    return key === "color"
      ? known.toLowerCase().includes(asked.toLowerCase())
      : same(asked, known);
  });
}
