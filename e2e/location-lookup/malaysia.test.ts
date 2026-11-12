import { expect, test } from "bun:test";

import { sampleFiles, useService } from "../harness.ts";

const sunway = {
  status: "OK",
  results: [
    {
      formatted_address:
        "Sunway Pyramid, 47500 Subang Jaya, Selangor, Malaysia",
      geometry: { location: { lat: 3.0733, lng: 101.6078 } },
    },
    {
      formatted_address: "Second result",
      geometry: { location: { lat: 1, lng: 2 } },
    },
  ],
};

const service = useService(async () => ({
  market: "MY",
  files: await sampleFiles(),
}));

const find = (args: Record<string, unknown>) =>
  service().call("find_location", args);
const lastAddress = () => service().geocoding.calls.at(-1)?.get("address");

test("§5 in an MY deployment, a lookup gives the first result with Malaysia as context", async () => {
  service().geocoding.reply({ body: sunway });
  expect(await find({ user_location: "Sunway Pyramid" })).toEqual({
    locations: [
      {
        latitude: 3.0733,
        longitude: 101.6078,
        formatted_address:
          "Sunway Pyramid, 47500 Subang Jaya, Selangor, Malaysia",
      },
    ],
  });
  expect(lastAddress()).toBe("Sunway Pyramid, Malaysia");
  expect(service().geocoding.calls.at(-1)?.get("key")).toBe(
    "test-google-key-0001",
  );
});

test("§5 a state gives context, and a result in another state still returns", async () => {
  service().geocoding.reply({ body: sunway });
  const result = await find({
    user_location: "Sunway Pyramid",
    state: "Johor",
  });
  expect(lastAddress()).toBe("Sunway Pyramid, Johor, Malaysia");
  expect(result).toMatchObject({
    locations: [{ formatted_address: sunway.results[0]?.formatted_address }],
  });
});

test("§5 a country gives context instead of the market country", async () => {
  service().geocoding.reply({ body: sunway });
  await find({ user_location: "Orchard Road", country: "Singapore" });
  expect(lastAddress()).toBe("Orchard Road, Singapore");
});

test("§5 a missing or blank location gives the missing-location outcome and makes no lookup", async () => {
  const before = service().geocoding.calls.length;
  const missing = {
    locations: [],
    message: "The location is missing. Ask for a location.",
  };
  expect(await find({})).toEqual(missing);
  expect(await find({ user_location: "   " })).toEqual(missing);
  expect(service().geocoding.calls.length).toBe(before);
});

test("§5 a lookup with no result gives the unrecognized-location outcome", async () => {
  service().geocoding.reply({ body: { status: "ZERO_RESULTS", results: [] } });
  expect(await find({ user_location: "Nowhere Mall" })).toEqual({
    locations: [],
    message: "The location is not recognized. Ask for a more specific place.",
  });
});

test("§5 a location-service failure gives the failure outcome, is logged, and other tools stay usable", async () => {
  for (const reply of [
    { body: { status: "REQUEST_DENIED", results: [] } },
    { httpStatus: 500, body: { error: "server" } },
  ]) {
    service().geocoding.reply(reply);
    expect(await find({ user_location: "Sunway Pyramid" })).toEqual({
      error: "The location service is unavailable.",
    });
  }
  const failures = service().logs.lines.filter(
    (line) => line.event === "location_service_failed",
  );
  expect(failures.length).toBeGreaterThanOrEqual(2);
  expect(await service().call("check_promotions", {})).toHaveProperty(
    "promotions",
  );
});

test(
  "§5 a timeout of the location service gives the failure outcome",
  async () => {
    service().geocoding.reply({ delayMs: 7000, body: sunway });
    expect(await find({ user_location: "Sunway Pyramid" })).toEqual({
      error: "The location service is unavailable.",
    });
  },
  { timeout: 10_000 },
);
