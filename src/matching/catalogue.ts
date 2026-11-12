import {
  normalizeSpec,
  readGenericSpecs,
  specMatches,
  type SpecName,
  type Specs,
} from "./specs.ts";
import { correctSpelling, isNumber, phrasePattern, words } from "./words.ts";

/** A catalogue entry. `model` is the catalogue model, and `specs` holds compared values. */
export interface Device {
  category: string;
  model: string;
  specs: Specs;
}

/** A read description. An absent `model` means any model of the categories. */
export interface Query {
  categories: string[];
  model?: string[];
  specs: Specs;
  modelNumber?: string;
}

/** A catalogue entry with the words of its model. */
export type Entry<T extends Device = Device> = T & { modelWords: string[] };

interface Group<T extends Device> {
  category: string;
  categoryWords: string[];
  devices: Entry<T>[];
  vocabulary: string[];
  values: [SpecName, string][];
}

export interface Catalogue<T extends Device> {
  categories: string[];
  groups: Group<T>[];
  vocabulary: string[];
}

const catalogueSpecs: SpecName[] = ["color", "material", "chipset"];

export function buildCatalogue<T extends Device>(devices: T[]): Catalogue<T> {
  const groups = new Map<string, Group<T>>();
  for (const device of devices) {
    const group = groups.get(device.category) ?? newGroup<T>(device.category);
    groups.set(device.category, group);
    const modelWords = words(device.model);
    group.devices.push({ ...device, modelWords });
    group.vocabulary.push(...modelWords);
    for (const name of catalogueSpecs) {
      const value = device.specs[name];
      if (value && !group.values.some(([, known]) => known === value))
        group.values.push([name, value]);
    }
  }
  const all = [...groups.values()];
  for (const group of all) group.vocabulary = unique(group.vocabulary);
  return {
    categories: all.map((group) => group.category),
    groups: all,
    vocabulary: unique(all.flatMap((group) => group.vocabulary)),
  };
}

function categoryWords(category: string): string[] {
  return words(category.replace(/_/g, " "));
}

export function devicesOf<T extends Device>(
  catalogue: Catalogue<T>,
  categories = catalogue.categories,
) {
  return catalogue.groups
    .filter((group) => categories.includes(group.category))
    .flatMap((group) => group.devices);
}

export function matchesQuery(device: Entry, query: Query): boolean {
  return (
    query.categories.includes(device.category) &&
    matchesModel(device, query.model) &&
    Object.entries(query.specs).every(([name, wanted]) =>
      specMatches(name as SpecName, wanted, device.specs[name as SpecName]),
    )
  );
}

/**
 * A model matches when it has each word of the request, and, for a request with a number,
 * the request has each word of the model. The category word of a model with other words is optional.
 */
function matchesModel(device: Entry, wanted: string[] | undefined): boolean {
  if (!wanted) return true;
  const own = categoryWords(device.category);
  const covered = wanted.every(
    (word) => device.modelWords.includes(word) || own.includes(word),
  );
  if (!covered || !wanted.some(isNumber)) return covered;
  const rest = device.modelWords.filter((word) => !own.includes(word));
  const required = rest.some((word) => !isNumber(word))
    ? rest
    : device.modelWords;
  return required.every((word) => wanted.includes(word));
}

/** Reads a description against the catalogue. Gives undefined when the description is not recognized. */
export function readDescription<T extends Device>(
  catalogue: Catalogue<T>,
  description: string,
): Query | undefined {
  const modelNumber = /\bA\d{4}\b/i.exec(description)?.[0].toUpperCase();
  const generic = readGenericSpecs(description.replace(/\bA\d{4}\b/gi, " "));
  const firstWords = words(generic.rest).map((word) =>
    correctSpelling(word, catalogue.vocabulary),
  );
  const groups = scopeOf(catalogue, firstWords);
  if (!groups.length)
    return modelNumber
      ? { categories: catalogue.categories, specs: generic.specs, modelNumber }
      : undefined;
  const valued = readCatalogueValues(generic.rest, groups);
  const vocabulary = unique(groups.flatMap((group) => group.vocabulary));
  const modelWords = words(valued.rest)
    .map((word) => correctSpelling(word, vocabulary))
    .filter((word) => isNumber(word) || vocabulary.includes(word));
  const ownWords = groups.flatMap((group) => group.categoryWords);
  const query: Query = {
    categories: groups.map((group) => group.category),
    model: modelWords.some((word) => !ownWords.includes(word))
      ? modelWords
      : undefined,
    specs: { ...generic.specs, ...valued.specs },
    modelNumber,
  };
  return readBareNumber(catalogue, query);
}

function scopeOf<T extends Device>(
  catalogue: Catalogue<T>,
  found: string[],
): Group<T>[] {
  const named = catalogue.groups.filter(
    (group) =>
      group.categoryWords.length &&
      group.categoryWords.every((word) => found.includes(word)),
  );
  if (named.length) return named;
  const names = found.filter((word) => !isNumber(word));
  return catalogue.groups.filter((group) =>
    names.some((word) => group.vocabulary.includes(word)),
  );
}

/** Colors, materials, and chipsets are the values of the catalogue. A longer value takes precedence. */
function readCatalogueValues<T extends Device>(
  text: string,
  groups: Group<T>[],
) {
  const values = groups
    .flatMap((group) => group.values)
    .toSorted(([, a], [, b]) => b.length - a.length);
  const specs: Specs = {};
  let rest = text;
  for (const [name, value] of values) {
    const pattern = phrasePattern(value, "ig");
    if (specs[name] || !pattern.test(rest)) continue;
    specs[name] = value;
    rest = rest.replace(pattern, " ");
  }
  return { specs, rest };
}

/** A bare number after a model is a generation or a size that the catalogue has for the model. */
function readBareNumber<T extends Device>(
  catalogue: Catalogue<T>,
  query: Query,
): Query {
  const { model, specs } = query;
  if (!model || specs.generation || specs.size) return query;
  const devices = devicesOf(catalogue, query.categories);
  if (devices.some((device) => matchesModel(device, model))) return query;
  const number = model.findLast(isNumber);
  if (!number) return query;
  const rest = model.filter((word) => word !== number);
  const candidates = devices.filter((device) => matchesModel(device, rest));
  const generation = normalizeSpec("generation", number);
  if (candidates.some((device) => device.specs.generation === generation))
    return { ...query, model: rest, specs: { ...specs, generation } };
  const size = candidates.find(
    (device) => Number.parseFloat(device.specs.size ?? "") === Number(number),
  );
  return size
    ? { ...query, model: rest, specs: { ...specs, size: size.specs.size } }
    : query;
}

function newGroup<T extends Device>(category: string): Group<T> {
  const own = categoryWords(category);
  return {
    category,
    categoryWords: own,
    devices: [],
    vocabulary: [...own],
    values: [],
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
