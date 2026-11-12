import { closest, distance } from "fastest-levenshtein";

/** Splits text into lowercase words. Letters and numbers are separate words, so "Fold7" is "fold 7". */
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/([a-z0-9])\+/g, "$1 plus ")
      .match(/[a-z]+|\d+(?:\.\d+)?/g) ?? []
  );
}

export function isNumber(word: string): boolean {
  return /^\d/.test(word);
}

/** Corrects a minor spelling mistake to a known word. Numbers and short words stay as they are. */
export function correctSpelling(word: string, known: string[]): string {
  if (isNumber(word) || word.length < 4 || known.includes(word)) return word;
  const candidates = known.filter((candidate) => !isNumber(candidate));
  if (!candidates.length) return word;
  const nearest = closest(word, candidates);
  return distance(word, nearest) <= (word.length >= 7 ? 2 : 1) ? nearest : word;
}

export function phrasePattern(phrase: string, flags = "i"): RegExp {
  const escaped = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, flags);
}
