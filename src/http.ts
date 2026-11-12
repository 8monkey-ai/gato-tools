import { createHash, timingSafeEqual } from "node:crypto";

import type { SourceStatus } from "./sources/source.ts";

interface Routes {
  mcpBearerToken: string;
  health: () => SourceStatus[];
  mcp: (request: Request) => Promise<Response>;
}

export function createFetchHandler({ mcpBearerToken, health, mcp }: Routes) {
  const expected = digest(`Bearer ${mcpBearerToken}`);
  return (request: Request): Response | Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === "/live") return Response.json({ status: "ok" });
    if (pathname === "/health") return healthResponse(health());
    if (pathname !== "/mcp") return new Response("Not found", { status: 404 });
    const given = digest(request.headers.get("authorization") ?? "");
    if (!timingSafeEqual(given, expected))
      return new Response("Unauthorized", {
        status: 401,
        headers: { "www-authenticate": "Bearer" },
      });
    return mcp(request);
  };
}

function healthResponse(sources: SourceStatus[]): Response {
  const failed = sources
    .filter((source) => !source.healthy)
    .map((source) => source.source);
  return Response.json(
    {
      status: failed.length ? "unhealthy" : "healthy",
      failed_sources: failed,
      sources,
    },
    { status: failed.length ? 503 : 200 },
  );
}

function digest(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}
