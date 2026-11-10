type Point = { lat: number; lng: number };

// Google Geocoding API. A place that is not known gives ZERO_RESULTS.
export function startFakeGeocoder() {
  const places = new Map<string, Point>();
  const calls: { address: string; key: string }[] = [];
  let status: "OK" | "REQUEST_DENIED" | "down" = "OK";
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const address = url.searchParams.get("address") ?? "";
      calls.push({ address, key: url.searchParams.get("key") ?? "" });
      if (status === "down")
        return new Response("Unavailable", { status: 503 });
      if (status !== "OK") return Response.json({ status, results: [] });
      const found = [...places].find(([name]) => address.startsWith(name))?.[1];
      return Response.json(
        found
          ? { status: "OK", results: [{ geometry: { location: found } }] }
          : { status: "ZERO_RESULTS", results: [] },
      );
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/maps/api/geocode/json`,
    apiKey: "test-google-key",
    places,
    calls,
    fail: (next: "REQUEST_DENIED" | "down") => {
      status = next;
    },
    stop: () => server.stop(true),
  };
}

export type FakeGeocoder = ReturnType<typeof startFakeGeocoder>;
