import { z } from "zod";

import type { Log } from "../../log.ts";
import { ToolError } from "../../tool-error.ts";

const responseSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        formatted_address: z.string(),
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
        }),
      }),
    )
    .default([]),
});

export interface Geocoding {
  url: string;
  key: string;
  log: Log;
}

export interface Place {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

/** Gives the first result of the Google Geocoding API, or undefined when it finds no result. */
export async function geocode(
  { url, key, log }: Geocoding,
  address: string,
): Promise<Place | undefined> {
  const response = await request(url, key, address).catch((error: unknown) => {
    throw failure(log, {
      error: error instanceof Error ? error.name : "unknown",
    });
  });
  const body = responseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!response.ok || !body.success)
    throw failure(log, { http_status: response.status });
  const { status, results } = body.data;
  if (status === "ZERO_RESULTS") return undefined;
  const first = results[0];
  if (status !== "OK" || !first) throw failure(log, { status });
  return {
    latitude: first.geometry.location.lat,
    longitude: first.geometry.location.lng,
    formatted_address: first.formatted_address,
  };
}

function request(url: string, key: string, address: string) {
  const query = new URLSearchParams({ address, key });
  return fetch(`${url}?${query}`, { signal: AbortSignal.timeout(5000) });
}

function failure(log: Log, fields: Record<string, unknown>): ToolError {
  log("error", "location_service_failed", fields);
  return new ToolError("The location service is unavailable.");
}
