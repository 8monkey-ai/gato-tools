// Path-style S3: the first path segment is the bucket, the rest is the key.
export function startFakeS3(bucket = "gato") {
  const objects = new Map<string, string>();
  const failing = new Set<string>();
  const delays = new Map<string, number>();
  const calls: { method: string; key: string }[] = [];
  const active = new Map<string, number>();
  const mostActive = new Map<string, number>();
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const key = path.slice(bucket.length + 2);
      calls.push({ method: request.method, key });
      active.set(key, (active.get(key) ?? 0) + 1);
      mostActive.set(key, Math.max(mostActive.get(key) ?? 0, active.get(key)!));
      await Bun.sleep(delays.get(key) ?? 0);
      active.set(key, active.get(key)! - 1);
      if (!path.startsWith(`/${bucket}/`) || failing.has(key))
        return new Response("<Error><Code>InternalError</Code></Error>", {
          status: 500,
        });
      if (request.method === "PUT") {
        objects.set(key, await request.text());
        return new Response(null, { status: 200 });
      }
      const object = objects.get(key);
      return object === undefined
        ? new Response("<Error><Code>NoSuchKey</Code></Error>", { status: 404 })
        : new Response(object);
    },
  });
  return {
    endpoint: `http://127.0.0.1:${server.port}`,
    bucket,
    objects,
    failing,
    delays,
    calls,
    mostActive,
    reads: (key: string) =>
      calls.filter((c) => c.method === "GET" && c.key === key).length,
    writes: (key: string) =>
      calls.filter((c) => c.method === "PUT" && c.key === key).length,
    stop: () => server.stop(true),
  };
}

export type FakeS3 = ReturnType<typeof startFakeS3>;
