import { expect, test } from "bun:test";

import {
  credentials,
  googleKey,
  sampleFiles,
  token,
  useService,
} from "../harness.ts";
import { health, toolCall } from "./health.ts";

const service = useService(async () => ({
  market: "MY",
  files: await sampleFiles(),
}));

const logLine = (event: string, key: string, value: unknown) =>
  service().logs.lines.find(
    (line) => line.event === event && line[key] === value,
  );

test("§1 the health check is healthy and shows the revision and the age of each source", async () => {
  const { code, body } = await health(service());
  expect(code).toBe(200);
  expect(body.status).toBe("healthy");
  expect(body.failed_sources).toEqual([]);
  expect(
    body.sources.map((source) => [source.source, source.revision]),
  ).toEqual([
    ["stock", '"v1"'],
    ["trade-in", '"v2"'],
    ["promotions", '"v3"'],
  ]);
  for (const source of body.sources)
    expect(source.age_seconds).toBeGreaterThanOrEqual(0);
});

test("§1 the liveness and health checks need no token", async () => {
  expect((await service().live()).status).toBe(200);
  expect((await service().health()).status).toBe(200);
});

test("§1 logs are JSON lines with a time, a level, and an event name", async () => {
  await service().call("check_availability", {
    model: "Used iPhone 12 Black 128GB",
  });
  for (const line of service().logs.lines) {
    expect(Number.isNaN(Date.parse(String(line.time)))).toBe(false);
    expect(line.level).toBeOneOf(["info", "warn", "error"]);
    expect(typeof line.event).toBe("string");
  }
  expect(logLine("startup", "market", "MY")).toBeDefined();
  expect(logLine("service_started", "event", "service_started")).toBeDefined();
  expect(logLine("source_loaded", "source", "stock")).toMatchObject({
    revision: '"v1"',
  });
  const call = logLine("tool_call", "tool", "check_availability");
  expect(call).toMatchObject({ outcome: "ok" });
  expect(typeof call?.duration_ms).toBe("number");
});

test("§1 the logs and the health check contain no token, credentials, descriptions, or locations", async () => {
  service().geocoding.reply({
    body: { status: "REQUEST_DENIED", results: [] },
  });
  await service().call("find_location", { user_location: "Secret Street 42" });
  await service().call("check_availability", {
    model: "Secret Phone Description",
  });
  await service().rpc(
    toolCall("check_promotions", {}),
    "Bearer leaked-wrong-token",
  );
  const healthText = JSON.stringify((await health(service())).body);
  const text = [...service().logs.raw, healthText].join("\n");
  for (const secret of [
    token,
    "leaked-wrong-token",
    credentials.accessKeyId,
    credentials.secretAccessKey,
    googleKey,
    "Secret Street",
    "Secret Phone",
    "Used iPhone 12 Black 128GB",
  ]) {
    expect(text).not.toContain(secret);
  }
  expect(
    logLine("location_service_failed", "status", "REQUEST_DENIED"),
  ).toBeDefined();
});
