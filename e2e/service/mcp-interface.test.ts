import { expect, test } from "bun:test";

import { sampleFiles, token, useService } from "../harness.ts";
import { toolCall } from "./health.ts";

const service = useService(async () => ({
  market: "MY",
  files: await sampleFiles(),
}));

test("§1 a request with a missing or wrong bearer token is refused and runs no tool", async () => {
  const call = toolCall("find_location", { user_location: "Sunway Pyramid" });
  for (const authorization of ["", "Bearer wrong-token", token]) {
    expect((await service().rpc(call, authorization)).status).toBe(401);
  }
  expect(service().geocoding.calls).toHaveLength(0);
  expect(
    service().logs.lines.filter((line) => line.event === "tool_call"),
  ).toHaveLength(0);
});

test("§1 a tool call with the correct token needs no earlier request or session", async () => {
  const response = await service().rpc(toolCall("check_promotions", {}));
  expect(response.status).toBe(200);
  expect(response.headers.get("mcp-session-id")).toBeNull();
  const body = (await response.json()) as { result: { isError?: boolean } };
  expect(body.result.isError).toBeUndefined();
});

test("§1 the service keeps no MCP session, so it offers no GET stream and no session end", async () => {
  for (const method of ["GET", "DELETE"]) {
    const response = await fetch(`${service().url()}/mcp`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      },
    });
    expect(response.status).toBe(405);
  }
});

test("§1 the bearer scheme name has no regard to capitalization", async () => {
  const response = await service().rpc(
    toolCall("check_promotions", {}),
    `bearer ${token}`,
  );
  expect(response.status).toBe(200);
});

test("§1 a request with text longer than the limit is refused", async () => {
  const long = "a".repeat(201);
  for (const [name, args] of [
    ["check_availability", { model: long }],
    ["check_sale_or_trade_in_value", { model: long }],
    ["check_promotions", { model: long }],
    ["find_location", { user_location: long }],
  ] as const) {
    expect((await service().call(name, args)).error).toContain(
      "Input validation error",
    );
  }
  expect(service().geocoding.calls).toHaveLength(0);
});

test("§1 text at the limit is accepted", async () => {
  const result = await service().call("check_availability", {
    model: "a".repeat(200),
  });
  expect(result.error).toBeUndefined();
});

test("§1 §3 an MY deployment exposes the four tools", async () => {
  expect(await service().listTools()).toEqual([
    "check_availability",
    "check_promotions",
    "check_sale_or_trade_in_value",
    "find_location",
  ]);
});
