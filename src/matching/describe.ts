import { parseQuery, specKeys, type Specs } from "./query.ts";

const tidy = (text: string) =>
  text
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Gives the catalogue model of a source product name. Supplied values take precedence over values read from the name.
export function describeProduct<T extends Record<string, string>>(
  name: string,
  supplied: T,
) {
  let text = name;
  for (const value of Object.values(supplied))
    if (value) text = text.replace(new RegExp(RegExp.escape(value), "gi"), " ");
  const parsed = parseQuery(text);
  const derived: Specs = {};
  for (const key of specKeys)
    if (key !== "condition" && parsed?.[key]) derived[key] = parsed[key];
  const given = Object.fromEntries(
    Object.entries(supplied).filter(([, value]) => value),
  );
  return {
    model: tidy(parsed?.model ?? text),
    specs: { ...derived, ...given } as Specs & Partial<T>,
  };
}
