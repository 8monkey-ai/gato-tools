import { expect, test } from "bun:test";

import { stockCsv, stockRow } from "../fixtures.ts";
import { sampleFiles, useService, waitFor } from "../harness.ts";
import { health } from "./health.ts";

const stock = (color: string) =>
  stockCsv([stockRow({ Model: `Used iPhone 12 ${color}`, Color: color })]);

const service = useService(async () => {
  const { "Stock.csv": _stock, ...files } = await sampleFiles();
  return { market: "MY", files };
});

const models = async () => {
  const result = (await service().call("check_availability", {
    model: "iPhone 12",
  })) as {
    devices?: { model: string }[];
    error?: string;
  };
  return result.error ?? result.devices?.map((device) => device.model);
};

/** Waits at most 10 seconds, the reload bound of SPECS.md section 1. */
const waitForStatus = (status: string) =>
  waitFor(async () =>
    (await health(service())).body.status === status ? true : undefined,
  );

test("§1 when the stock source is unavailable, the other tools still answer", async () => {
  expect(await models()).toBe("Stock data is unavailable.");
  expect(await service().call("check_promotions", {})).toHaveProperty(
    "promotions",
  );
  service().geocoding.reply({ body: { status: "ZERO_RESULTS", results: [] } });
  const location = await service().call("find_location", {
    user_location: "Sunway Pyramid",
  });
  expect(location).toHaveProperty("locations");
  const value = await service().call("check_sale_or_trade_in_value", {
    model: "iPhone 12",
  });
  expect(value).toHaveProperty("devices");
});

test("§1 a missing file at startup makes the health check unhealthy and names the source", async () => {
  const { code, body } = await health(service());
  expect(code).toBe(503);
  expect(body.failed_sources).toEqual(["stock"]);
  expect(body.sources[0]?.healthy).toBe(false);
  expect(body.sources[0]?.revision).toBeUndefined();
  expect(body.sources[0]?.last_failure?.reason).toBe("file missing");
  expect(
    Number.isNaN(Date.parse(body.sources[0]?.last_failure?.time ?? "")),
  ).toBe(false);
  expect((await service().live()).status).toBe(200);
});

test(
  "§1 a new version is in use within 10 seconds with no restart, and the health check is healthy again",
  async () => {
    const pid = service().child.pid;
    service().s3.put("Stock.csv", stock("Red"));
    await waitForStatus("healthy");
    expect(await models()).toEqual(["Used iPhone 12 Red"]);
    service().s3.put("Stock.csv", stock("Blue"));
    await waitFor(async () =>
      (await models())?.[0] === "Used iPhone 12 Blue" ? true : undefined,
    );
    expect(service().child.pid).toBe(pid);
  },
  { timeout: 25_000 },
);

test(
  "§1 an unusable changed file keeps the previous version and the health check names the source",
  async () => {
    service().s3.put("Stock.csv", "not,a,stock,export\n1,2,3,4");
    await waitForStatus("unhealthy");
    const { body } = await health(service());
    expect(body.failed_sources).toEqual(["stock"]);
    expect(body.sources[0]?.last_failure?.reason).toBe("file unusable");
    expect(await models()).toEqual(["Used iPhone 12 Blue"]);
    const failure = service().logs.lines.find(
      (line) => line.event === "source_load_failed",
    );
    expect(failure).toMatchObject({ source: "stock" });
  },
  { timeout: 15_000 },
);

test(
  "§1 a missing changed file keeps the previous version",
  async () => {
    service().s3.put("Stock.csv", stock("Blue"));
    await waitForStatus("healthy");
    service().s3.remove("Stock.csv");
    await waitForStatus("unhealthy");
    expect(await models()).toEqual(["Used iPhone 12 Blue"]);
  },
  { timeout: 25_000 },
);

test("§1 a restart loads the file again", async () => {
  service().s3.put("Stock.csv", stock("Gold"));
  await service().restart();
  expect(await models()).toEqual(["Used iPhone 12 Gold"]);
  expect((await health(service())).code).toBe(200);
});
