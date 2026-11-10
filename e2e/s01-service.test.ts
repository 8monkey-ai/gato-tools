import { afterEach, expect, test } from "bun:test";

import { campaigns, device, offer, stockFeed, stores } from "./support/data.ts";
import { createWorld, keys, token, type World } from "./support/world.ts";

let world: World;
afterEach(async () => world.close());

async function startWith(extra: Record<string, string> = {}) {
  world = createWorld();
  return world.start(extra);
}

test("§1 §3 an MY deployment exposes the four tools", async () => {
  const app = await startWith();
  expect(app.started).toBe(true);
  expect(await app.tools()).toEqual([
    "check_availability",
    "check_promotions",
    "check_sale_or_trade_in_value",
    "find_closest_store",
  ]);
});

test("§1 §3 a PH deployment exposes device availability, promotions, and store discovery only, and does not permit a trade-in call", async () => {
  const app = await startWith({ MARKET: "PH", TRADE_IN_REFERENCE_KEY: "" });
  expect(await app.tools()).toEqual([
    "check_availability",
    "check_promotions",
    "find_closest_store",
  ]);
  const call = await app.call("check_sale_or_trade_in_value", {
    model: "iPhone 12",
  });
  expect(call.isError).toBe(true);
  expect(world.s3.reads(keys.tradeIn)).toBe(0);
});

test("§1 a PH deployment with no timezone setting uses UTC for today", async () => {
  world = createWorld();
  const utcToday = new Date().toISOString().slice(0, 10);
  world.s3.objects.set(
    keys.campaigns,
    campaigns(
      offer({ name: "Today", start_date: utcToday, end_date: utcToday }),
    ),
  );
  const app = await world.start({ MARKET: "PH" });
  expect((await app.health()).timezone).toBe("UTC");
  const answer = await app.call("check_promotions", {});
  expect(answer.json().promotions.map((p) => p.name)).toEqual(["Today"]);
});

test("§1 when the stock source is unavailable, promotions and store discovery still answer", async () => {
  world = createWorld();
  world.s3.failing.add(keys.stock);
  world.s3.objects.set(keys.campaigns, campaigns(offer({ name: "Raya" })));
  world.s3.objects.set(
    keys.stores,
    stores(["Mid Valley", "Kuala Lumpur", 3.11, 101.67]),
  );
  const app = await world.start();
  expect(app.started).toBe(true);

  const stock = await app.call("check_availability", { model: "iPhone 12" });
  expect(stock).toMatchObject({
    isError: true,
    text: "The stock data is unavailable.",
  });
  expect(
    (await app.call("check_promotions", {})).json().promotions[0]?.name,
  ).toBe("Raya");
  const found = await app.call("find_closest_store", { state: "Kuala Lumpur" });
  expect(found.json().stores[0]?.name).toBe("Mid Valley");
});

test("§1 each source reports a failed initial load as a failure, never as an empty result", async () => {
  world = createWorld();
  for (const key of Object.values(keys)) world.s3.objects.delete(key);
  const app = await world.start();
  const calls = {
    check_availability: { model: "iPhone 12" },
    check_sale_or_trade_in_value: { model: "iPhone 12" },
    check_promotions: {},
    find_closest_store: { state: "Selangor" },
  };
  for (const [name, args] of Object.entries(calls))
    expect(await app.call(name, args)).toMatchObject({ isError: true });
  const health = await app.health();
  for (const source of Object.values(health.sources)) {
    expect(source.revision).toBeUndefined();
    expect(source.failure?.error).toContain("404");
  }
  expect(Object.keys(health.sources)).toHaveLength(4);
});

test("§1 unusable data is a failure, distinct from a valid empty source", async () => {
  world = createWorld();
  world.s3.objects.set(keys.stock, "{not json");
  world.s3.objects.set(keys.campaigns, "- name: Broken\n");
  const app = await world.start();
  expect((await app.call("check_availability", {})).isError).toBe(true);
  expect((await app.call("check_promotions", {})).isError).toBe(true);
  expect(
    (await app.call("find_closest_store", { state: "Selangor" })).text,
  ).toBe("No store is in this state.");
});

test("§1 a failed refresh keeps the previous version with no stale-age cutoff, and a later refresh replaces it", async () => {
  world = createWorld();
  world.s3.objects.set(keys.stock, stockFeed(device({ model: "iPhone 12" })));
  const app = await world.start({ SOURCE_MAX_AGE_SECONDS: "0.2" });
  const models = async () =>
    (await app.call("check_availability", {}))
      .json()
      .devices.map((d) => d.model);
  expect(await models()).toEqual(["iPhone 12"]);

  world.s3.failing.add(keys.stock);
  for (let i = 0; i < 4; i++) {
    await Bun.sleep(250);
    expect(await models()).toEqual(["iPhone 12"]);
  }
  const health = await app.health();
  expect(health.sources.stock.failure?.error).toContain("500");
  expect(health.sources.stock.ageSeconds).toBeGreaterThanOrEqual(1);

  world.s3.failing.delete(keys.stock);
  world.s3.objects.set(keys.stock, stockFeed(device({ model: "iPhone 13" })));
  await Bun.sleep(250);
  await models();
  await Bun.sleep(100);
  expect(await models()).toEqual(["iPhone 13"]);
  expect((await app.health()).sources.stock.failure).toBeUndefined();
});

test("§1 a restart loads every source again", async () => {
  world = createWorld();
  const first = await world.start();
  const revision = (await first.health()).sources.stock.revision;
  await first.stop();
  world.s3.objects.set(keys.stock, stockFeed(device({ model: "iPhone 15" })));
  const second = await world.start();
  expect((await second.health()).sources.stock.revision).not.toBe(revision);
  expect(
    (await second.call("check_availability", {})).json().devices[0]?.model,
  ).toBe("iPhone 15");
  for (const key of Object.values(keys)) expect(world.s3.reads(key)).toBe(2);
});

test("§1 MCP requests without the bearer token are refused", async () => {
  const app = await startWith();
  const response = await fetch(`${app.url}/mcp`, {
    method: "POST",
    body: "{}",
  });
  expect(response.status).toBe(401);
  const wrong = await fetch(`${app.url}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}x` },
  });
  expect(wrong.status).toBe(401);
});
