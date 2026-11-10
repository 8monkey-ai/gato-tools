import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const repoRoot = join(import.meta.dir, "../..");

export type LogLine = { event: string; level: string; [key: string]: unknown };

export async function waitUntil<T>(
  check: () => T | Promise<T>,
  timeoutMs = 5000,
  what = "condition",
): Promise<NonNullable<T>> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await Bun.sleep(25);
  }
}

function collect(proc: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const logs: LogLine[] = [];
  const read = async (stream: ReadableStream<Uint8Array>) => {
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const lines = (buffer + decoder.decode(chunk, { stream: true })).split(
        "\n",
      );
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          logs.push(JSON.parse(line) as LogLine);
        } catch {
          logs.push({ event: "output", level: "info", line });
        }
      }
    }
  };
  void read(proc.stdout);
  void read(proc.stderr);
  return logs;
}

type Entry = Record<string, unknown>;
export type Answer = {
  devices: Entry[];
  promotions: Entry[];
  stores: Entry[];
  adjustments?: unknown;
  note?: string;
};
export type ToolAnswer = { text: string; isError: boolean; json: () => Answer };

function mcpClient(url: string, token: string) {
  let client: Promise<Client> | undefined;
  const open = () =>
    (client ??= (async () => {
      const opened = new Client({ name: "e2e", version: "1.0.0" });
      await opened.connect(
        new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${token}` } },
        }),
      );
      return opened;
    })());
  return {
    async tools() {
      return (await (await open()).listTools()).tools.map((t) => t.name).sort();
    },
    async call(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<ToolAnswer> {
      const result = await (await open()).callTool({ name, arguments: args });
      const content = result.content as { type: string; text: string }[];
      const text = content.map((c) => c.text).join("");
      return {
        text,
        isError: result.isError === true,
        json: () => JSON.parse(text) as Answer,
      };
    },
    close: async () => (client ? (await client).close() : undefined),
  };
}

type SourceStatus = {
  revision?: string;
  ageSeconds?: number;
  failure?: { error: string };
};
type Health = {
  timezone: string;
  sources: Record<"stock" | "trade-in" | "campaigns" | "stores", SourceStatus>;
  preparations: Record<"stock" | "trade-in", { lastRun?: { error?: string } }>;
};

export async function startApp(env: Record<string, string>) {
  const proc = Bun.spawn(["bun", "src/main.ts"], {
    cwd: repoRoot,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const logs = collect(proc);
  const started = await waitUntil(
    () =>
      logs.find((l) =>
        ["service.ready", "service.start_failed"].includes(l.event),
      ) ??
      (proc.exitCode !== null
        ? { event: "exited", level: "error" }
        : undefined),
    15_000,
    "the service to start",
  );
  const url = `http://127.0.0.1:${String(started.port)}`;
  const mcp = mcpClient(url, env.MCP_BEARER_TOKEN ?? "");
  return {
    url,
    started: started.event === "service.ready",
    logs,
    ...mcp,
    health: async () => (await (await fetch(`${url}/health`)).json()) as Health,
    async stop() {
      await mcp.close();
      if (proc.exitCode === null) proc.kill("SIGTERM");
      await proc.exited;
    },
  };
}

export type App = Awaited<ReturnType<typeof startApp>>;
