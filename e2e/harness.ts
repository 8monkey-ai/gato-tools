import { afterAll, beforeAll } from "bun:test";

import type { Subprocess } from "bun";

/** A fake S3 bucket. It serves HEAD and GET for path-style keys, and records each call. */
export function startFakeS3(bucket: string, initial: Record<string, string>) {
  const files = new Map<
    string,
    { body: string; etag: string; modified: Date }
  >();
  const calls: { method: string; key: string }[] = [];
  let version = 0;
  const put = (key: string, body: string) => {
    version += 1;
    files.set(key, { body, etag: `"v${version}"`, modified: new Date() });
  };
  for (const [key, body] of Object.entries(initial)) put(key, body);
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const key = path.slice(bucket.length + 2);
      calls.push({ method: request.method, key });
      const file = path.startsWith(`/${bucket}/`) ? files.get(key) : undefined;
      if (!file)
        return new Response(
          "<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>",
          { status: 404 },
        );
      const headers = {
        etag: file.etag,
        "last-modified": file.modified.toUTCString(),
      };
      if (request.method === "HEAD")
        return new Response(null, {
          headers: {
            ...headers,
            "content-length": String(Buffer.byteLength(file.body)),
          },
        });
      return new Response(file.body, { headers });
    },
  });
  return {
    url: `http://localhost:${server.port}`,
    calls,
    put,
    remove: (key: string) => files.delete(key),
    stop: () => server.stop(true),
  };
}

export type FakeGeocodingReply = {
  delayMs?: number;
  httpStatus?: number;
  body: unknown;
};

/** A fake Google Geocoding API. Each call gives the next reply, and the fake records the query. */
export function startFakeGeocoding() {
  const calls: URLSearchParams[] = [];
  let reply: FakeGeocodingReply = {
    body: { status: "ZERO_RESULTS", results: [] },
  };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      calls.push(new URL(request.url).searchParams);
      if (reply.delayMs) await Bun.sleep(reply.delayMs);
      return Response.json(reply.body, { status: reply.httpStatus ?? 200 });
    },
  });
  return {
    url: `http://localhost:${server.port}/maps/api/geocode/json`,
    calls,
    reply: (next: FakeGeocodingReply) => (reply = next),
    stop: () => server.stop(true),
  };
}

export const token = "test-token-7f3a";
export const credentials = {
  accessKeyId: "AKIATESTKEY0001",
  secretAccessKey: "test-secret-key-0001",
};
export const googleKey = "test-google-key-0001";

export interface ServiceOptions {
  market: "MY" | "PH";
  files: Record<string, string>;
  timezone?: string;
}

/** Starts the service as it runs in production, with fakes for S3 and the Google Geocoding API. */
export async function startService({
  market,
  files,
  timezone,
}: ServiceOptions) {
  const s3 = startFakeS3("gato-test", files);
  const geocoding = startFakeGeocoding();
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    PORT: "0",
    GATO_TOOLS_MARKET: market,
    MCP_BEARER_TOKEN: token,
    GOOGLE_GEOCODING_API_KEY: googleKey,
    GOOGLE_GEOCODING_URL: geocoding.url,
    S3_BUCKET: "gato-test",
    S3_ENDPOINT: s3.url,
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: credentials.accessKeyId,
    S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    ...(timezone && { GATO_TOOLS_TIMEZONE: timezone }),
  };
  const sourceCount = market === "MY" ? 3 : 2;
  let running = await spawnService(env, sourceCount);
  return {
    s3,
    geocoding,
    get logs() {
      return running.logs;
    },
    get child() {
      return running.child;
    },
    ...client(() => running.url),
    /** Stops the service with a stop signal and starts it again with the same configuration. */
    async restart() {
      running.child.kill("SIGTERM");
      await running.child.exited;
      running = await spawnService(env, sourceCount);
    },
    stop: () => stop(running.child, s3, geocoding),
  };
}

async function spawnService(env: Record<string, string>, sourceCount: number) {
  const child = Bun.spawn(["bun", "src/main.ts"], {
    env,
    stdout: "pipe",
    stderr: "inherit",
  });
  const logs = collectLogs(child);
  const started = await waitFor(() =>
    logs.lines.find((line) => line.event === "service_started"),
  );
  await waitFor(() => {
    const loads = logs.lines.filter((line) =>
      /^source_load/.test(String(line.event)),
    );
    return loads.length >= sourceCount || undefined;
  });
  return { child, logs, url: `http://localhost:${String(started.port)}` };
}

export type Service = Awaited<ReturnType<typeof startService>>;

/** Starts one service for the test file, and stops it after the last test. */
export function useService(
  options: () => Promise<ServiceOptions> | ServiceOptions,
): () => Service {
  let service: Service | undefined;
  beforeAll(async () => {
    service = await startService(await options());
  });
  afterAll(() => service?.stop());
  return () => {
    if (!service) throw new Error("the service has not started");
    return service;
  };
}

function client(url: () => string) {
  /** An empty authorization sends no Authorization header. */
  const rpc = (body: unknown, authorization = `Bearer ${token}`) =>
    fetch(`${url()}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(authorization && { authorization }),
      },
      body: JSON.stringify(body),
    });
  const tools = async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const body = (await response.json()) as {
      result: { tools: { name: string; description: string }[] };
    };
    return body.result.tools;
  };
  return {
    rpc,
    /** Calls a tool and gives the parsed result, or the error text for an error result. */
    async call(name: string, args: Record<string, unknown> = {}) {
      const response = await rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      });
      const body = (await response.json()) as {
        result?: { isError?: boolean; content: { text: string }[] };
        error?: { message: string };
      };
      if (body.error) return { error: body.error.message };
      const text = body.result?.content[0]?.text ?? "";
      return body.result?.isError
        ? { error: text }
        : (JSON.parse(text) as Record<string, unknown>);
    },
    async listTools() {
      return (await tools()).map((tool) => tool.name).toSorted();
    },
    async toolDescription(name: string) {
      return (await tools()).find((tool) => tool.name === name)?.description;
    },
    health: () => fetch(`${url()}/health`),
    live: () => fetch(`${url()}/live`),
    url,
  };
}

function collectLogs(child: Subprocess<"ignore", "pipe", "inherit">) {
  const lines: Record<string, unknown>[] = [];
  const raw: string[] = [];
  void (async () => {
    let buffer = "";
    for await (const chunk of child.stdout.pipeThrough(
      new TextDecoderStream(),
    )) {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        raw.push(part);
        lines.push(JSON.parse(part) as Record<string, unknown>);
      }
    }
  })();
  return { lines, raw };
}

export async function waitFor<T>(
  check: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await Bun.sleep(50);
  }
}

async function stop(child: Subprocess, ...fakes: { stop: () => unknown }[]) {
  child.kill("SIGTERM");
  await child.exited;
  for (const fake of fakes) await fake.stop();
}

export async function sampleFiles() {
  const read = (name: string) => Bun.file(`sample_data/${name}`).text();
  return {
    "Stock.csv": await read("Stock.csv"),
    "Trade-in.csv": await read("Trade-in.csv"),
    "promotions.yaml": await read("promotions.yaml"),
  };
}
