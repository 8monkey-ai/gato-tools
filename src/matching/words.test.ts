import { expect, test } from "bun:test";

import { correctSpelling, phrasePattern, words } from "./words.ts";

test("letters and numbers are separate words, and a plus sign is the word plus", () => {
  expect(words("Galaxy Z Fold7")).toEqual(["galaxy", "z", "fold", "7"]);
  expect(words("GALAXY S23+")).toEqual(["galaxy", "s", "23", "plus"]);
  expect(words('iPad Pro 12.9"')).toEqual(["ipad", "pro", "12.9"]);
});

test("a minor spelling mistake becomes the known word", () => {
  expect(correctSpelling("iphne", ["iphone", "ipad"])).toBe("iphone");
  expect(correctSpelling("macbok", ["macbook"])).toBe("macbook");
});

test("numbers, short words, and distant words stay as they are", () => {
  expect(correctSpelling("14", ["13", "iphone"])).toBe("14");
  expect(correctSpelling("pr", ["pro"])).toBe("pr");
  expect(correctSpelling("nokia", ["iphone"])).toBe("nokia");
});

test("a phrase matches whole words only, with no regard to capitalization", () => {
  expect(phrasePattern("M1").test("MacBook m1 Pro")).toBe(true);
  expect(phrasePattern("M1").test("MacBook M10")).toBe(false);
  expect(phrasePattern('13"').test('MacBook 13" M2')).toBe(true);
});
