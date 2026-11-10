import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { readConfig } from "./config.ts";
import type { Env } from "./env.ts";
import { startHttp } from "./http.ts";
import { log } from "./log.ts";
import { createPreparation } from "./preparation.ts";
import { s3Storage } from "./sources/s3.ts";
import { createSource } from "./sources/source.ts";
import { availability } from "./tools/availability/availability.ts";
import { promotions } from "./tools/promotions/promotions.ts";
import { stores } from "./tools/stores/store-discovery.ts";
import type { ToolContext, ToolFactory } from "./tools/tool.ts";
import { tradeIn } from "./tools/trade-in/trade-in.ts";

// The closed set of tools that this build links.
const factories: ToolFactory[] = [availability, tradeIn, promotions, stores];

async function start(env: Env) {
  const config = readConfig(env);
  const storage = s3Storage(config.s3);
  const context: ToolContext = {
    env,
    market: config.market,
    timezone: config.timezone,
    storage,
    source: (name, key, parse) =>
      createSource({
        name,
        key,
        parse,
        storage,
        maxAgeMs: config.sourceMaxAgeMs,
      }),
    preparation: (name, run) =>
      createPreparation(name, config.preparationIntervalMs, run),
  };
  const tools = factories.flatMap((create) => create(context) ?? []);
  const sources = tools.flatMap((tool) => tool.sources);
  const preparations = tools.flatMap((tool) => tool.preparations);
  // Prepared feeds are published before the first load, so that the first load can use them.
  await Promise.all(preparations.map((p) => p.start()));
  await Promise.all(sources.map((s) => s.load()));
  const server = startHttp({
    port: config.port,
    bearerToken: config.bearerToken,
    mcpServer: () => {
      const mcp = new McpServer({ name: "gato-tools", version: "1.0.0" });
      for (const tool of tools) tool.register(mcp);
      return mcp;
    },
    health: () => ({
      market: config.market.code,
      timezone: config.timezone,
      sources: Object.fromEntries(sources.map((s) => [s.name, s.status()])),
      preparations: Object.fromEntries(
        preparations.map((p) => [p.name, p.status()]),
      ),
    }),
  });
  log.info("service.ready", { port: server.port, market: config.market.code });
  return async () => {
    await Promise.all(preparations.map((p) => p.stop()));
    await server.stop();
  };
}

function onSignal(stop: () => Promise<void>) {
  const shutdown = (signal: string) => {
    log.info("service.stopping", { signal });
    void stop().then(() => process.exit(0));
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

start(process.env)
  .then(onSignal)
  .catch((error: unknown) => {
    log.error("service.start_failed", { error });
    process.exit(1);
  });
