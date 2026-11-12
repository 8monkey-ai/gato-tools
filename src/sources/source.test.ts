import { expect, test } from "bun:test";

import type { Log } from "../log.ts";
import { type FileStore, watchSource } from "./source.ts";

function fakeStore() {
  const files = new Map<string, { text: string; revision: string }>();
  const reads: string[] = [];
  const store: FileStore = {
    stat: (key) => {
      const file = files.get(key);
      return Promise.resolve(
        file && { revision: file.revision, modified: new Date(0) },
      );
    },
    read: (key) => {
      reads.push(key);
      return Promise.resolve(files.get(key)?.text ?? "");
    },
  };
  return { files, reads, store };
}

function setup() {
  const { files, reads, store } = fakeStore();
  const events: string[] = [];
  const log: Log = (_level, event) => events.push(event);
  const parse = (text: string) => {
    if (text === "bad") throw new Error("unusable");
    return text;
  };
  const source = watchSource(
    { name: "test", file: "f", label: "Test", parse },
    store,
    log,
  );
  return { files, reads, events, source };
}

test("an unchanged revision is not read again", async () => {
  const { files, reads, source } = setup();
  files.set("f", { text: "one", revision: "1" });
  await source.refresh();
  await source.refresh();
  expect(reads).toEqual(["f"]);
  expect(source.current()).toBe("one");
});

test("an unusable changed file keeps the previous version until a valid one loads", async () => {
  const { files, events, source } = setup();
  files.set("f", { text: "one", revision: "1" });
  await source.refresh();
  files.set("f", { text: "bad", revision: "2" });
  await source.refresh();
  await source.refresh();
  expect(source.current()).toBe("one");
  expect(source.status(new Date(5000))).toMatchObject({
    healthy: false,
    revision: "1",
    age_seconds: 5,
    last_failure: { reason: "file unusable" },
  });
  expect(events).toEqual(["source_loaded", "source_load_failed"]);
  files.set("f", { text: "two", revision: "3" });
  await source.refresh();
  expect(source.current()).toBe("two");
  expect(source.status(new Date(0)).healthy).toBe(true);
});

test("a read failure is retried at the next refresh", async () => {
  const { files, store } = fakeStore();
  let fail = true;
  const flaky: FileStore = {
    stat: store.stat,
    read: (key) =>
      fail ? Promise.reject(new Error("network")) : store.read(key),
  };
  const source = watchSource(
    { name: "t", file: "f", label: "T", parse: (text) => text },
    flaky,
    () => {},
  );
  files.set("f", { text: "one", revision: "1" });
  await source.refresh();
  expect(source.status(new Date(0)).last_failure?.reason).toBe(
    "file unreadable",
  );
  fail = false;
  await source.refresh();
  expect(source.current()).toBe("one");
});
