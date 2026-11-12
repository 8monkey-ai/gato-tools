import { expect, test } from "bun:test";

import { createFetchHandler } from "./http.ts";

const calls: Request[] = [];
const handle = createFetchHandler({
  mcpBearerToken: "secret",
  health: () => [{ source: "stock", healthy: false }],
  mcp: (request) => {
    calls.push(request);
    return Promise.resolve(new Response("mcp"));
  },
});

const mcp = (authorization?: string) =>
  handle(
    new Request("http://service/mcp", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );

test("an MCP request with a missing or wrong token is refused before the MCP server", async () => {
  expect((await mcp()).status).toBe(401);
  expect((await mcp("Bearer wrong")).status).toBe(401);
  expect((await mcp("secret")).status).toBe(401);
  expect(calls).toHaveLength(0);
  expect(await (await mcp("Bearer secret")).text()).toBe("mcp");
});

test("the health check names the failed sources, and the liveness check does not depend on them", async () => {
  const health = await handle(new Request("http://service/health"));
  expect(health.status).toBe(503);
  expect(await health.json()).toMatchObject({
    status: "unhealthy",
    failed_sources: ["stock"],
  });
  expect((await handle(new Request("http://service/live"))).status).toBe(200);
});
