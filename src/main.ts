import type { Server } from "bun";

import { readConfig } from "./config.ts";
import { createFetchHandler } from "./http.ts";
import { log } from "./log.ts";
import { handleMcp } from "./mcp.ts";
import { s3FileStore } from "./sources/s3.ts";
import { type WatchedSource, watchSource } from "./sources/source.ts";
import { tools } from "./tools/index.ts";
import type { ToolEnvironment } from "./tools/tool.ts";

type Config = ReturnType<typeof readConfig>;

function toolEnvironment(
  config: Config,
  sources: WatchedSource<unknown>[],
): ToolEnvironment {
  const store = s3FileStore();
  const dateFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
  });
  return {
    market: config.market,
    today: () => dateFormat.format(new Date()),
    variables: process.env,
    log,
    watch(source) {
      const watched = watchSource(source, store, log);
      sources.push(watched);
      return watched;
    },
  };
}

function start() {
  const config = readConfig(process.env);
  log("info", "startup", {
    market: config.market.code,
    timezone: config.timezone,
  });
  const sources: WatchedSource<unknown>[] = [];
  const environment = toolEnvironment(config, sources);
  const available = tools
    .filter((tool) => tool.markets.includes(config.market.code))
    .map((tool) => ({ name: tool.name, ...tool.setup(environment) }));

  const server = Bun.serve({
    port: config.port,
    fetch: createFetchHandler({
      mcpBearerToken: config.mcpBearerToken,
      health: () => sources.map((source) => source.status(new Date())),
      mcp: (request) => handleMcp(request, available, log),
    }),
  });
  log("info", "service_started", {
    port: server.port,
    tools: available.map((tool) => tool.name),
  });

  const refresh = () =>
    void Promise.all(sources.map((source) => source.refresh()));
  refresh();
  stopOnSignal(server, setInterval(refresh, 5000));
}

function stopOnSignal(server: Server<undefined>, poll: Timer) {
  const shutdown = async (signal: string) => {
    log("info", "shutdown_started", { signal });
    clearInterval(poll);
    await server.stop();
    log("info", "shutdown", {});
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

try {
  start();
} catch (error) {
  log("error", "startup_failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
}
