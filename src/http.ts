import { createHash, timingSafeEqual } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { log } from "./log.ts";

const digest = (text: string) => createHash("sha256").update(text).digest();

export function startHttp(options: {
  port: number;
  bearerToken: string;
  mcpServer: () => McpServer;
  health: () => unknown;
}) {
  const expected = digest(`Bearer ${options.bearerToken}`);
  const authorized = (request: Request) =>
    timingSafeEqual(
      digest(request.headers.get("authorization") ?? ""),
      expected,
    );
  return Bun.serve({
    port: options.port,
    maxRequestBodySize: 1_000_000,
    routes: {
      "/health": () => Response.json(options.health()),
      "/mcp": async (request) => {
        if (!authorized(request))
          return new Response("Unauthorized", { status: 401 });
        // Stateless: each request gets its own server and transport.
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        try {
          await options.mcpServer().connect(transport);
          return await transport.handleRequest(request);
        } catch (error) {
          log.error("mcp.request_failed", { error });
          return new Response("Internal error", { status: 500 });
        }
      },
    },
    fetch: () => new Response("Not found", { status: 404 }),
  });
}
