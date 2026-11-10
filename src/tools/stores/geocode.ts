import { z } from "zod";

import type { Point } from "./stores.ts";

export type Geocode = (address: string) => Promise<Point | undefined>;

const answer = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
        }),
      }),
    )
    .default([]),
});

// Google Geocoding API. "ZERO_RESULTS" is a successful lookup with no result. Other statuses are failures.
export function googleGeocoder(apiKey: string, url: string): Geocode {
  return async (address) => {
    const request = new URL(url);
    request.searchParams.set("address", address);
    request.searchParams.set("key", apiKey);
    const response = await fetch(request, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Geocoding answered ${response.status}`);
    const body = answer.parse(await response.json());
    if (body.status === "ZERO_RESULTS") return undefined;
    const [first] = body.results;
    if (body.status !== "OK" || !first)
      throw new Error(`Geocoding status ${body.status}`);
    return first.geometry.location;
  };
}
