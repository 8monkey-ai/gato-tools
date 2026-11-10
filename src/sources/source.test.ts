import { afterEach, expect, setSystemTime, test } from "bun:test";

import { createSource, type ObjectStorage } from "./source.ts";

afterEach(() => setSystemTime());

function storage(texts: (string | Error)[]) {
  const reads: string[] = [];
  const store: ObjectStorage = {
    read: (key) => {
      reads.push(key);
      const next = texts.shift() ?? new Error("no more");
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    },
    write: () => Promise.resolve(),
  };
  return { store, reads };
}

const numberSource = (store: ObjectStorage) =>
  createSource({
    name: "numbers",
    key: "n.json",
    storage: store,
    maxAgeMs: 1000,
    parse: (t) => Number(JSON.parse(t)),
  });

test("concurrent first queries share one load", async () => {
  const { store, reads } = storage(["1"]);
  const source = numberSource(store);
  expect(await Promise.all([source.get(), source.get()])).toEqual([1, 1]);
  expect(reads).toHaveLength(1);
});

test("after a failed refresh, the source waits the maximum age before it tries again", async () => {
  setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const { store, reads } = storage(["1", new Error("down"), "2"]);
  const source = numberSource(store);
  await source.load();
  setSystemTime(new Date("2026-01-01T00:00:01Z"));
  expect(await source.get()).toBe(1);
  await source.load();
  expect(await source.get()).toBe(1);
  expect(reads).toHaveLength(2);
  expect(source.status()).toMatchObject({
    failure: { error: "down" },
    ageSeconds: 1,
  });
  setSystemTime(new Date("2026-01-01T00:00:02Z"));
  await source.get();
  await source.load();
  expect(await source.get()).toBe(2);
});
