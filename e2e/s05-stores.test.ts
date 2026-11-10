import { expect, test } from "bun:test";

import type { ToolAnswer } from "./support/app.ts";
import { campaigns, offer, stores } from "./support/data.ts";
import { openWorld } from "./support/search.ts";
import { keys } from "./support/world.ts";

// One degree of latitude is 111.195 km on the sphere that the service uses.
const kmNorth = (km: number) => km / 111.19492664455873;

async function startWith(reference: string, env: Record<string, string> = {}) {
  const world = openWorld();
  world.s3.objects.set(keys.stores, reference);
  world.geocoder.places.set("Sunway Pyramid", { lat: 0, lng: 0 });
  const app = await world.start(env);
  const find = (args: Record<string, unknown>) =>
    app.call("find_closest_store", args);
  return { world, app, find };
}

const storeNames = (answer: ToolAnswer) =>
  answer.json().stores.map((s) => s.name);

const selangor = stores(
  ["Sunway", "Selangor", 3.07, 101.6],
  ["Mid Valley", "Kuala Lumpur", 3.11, 101.67],
  ["Shah Alam", "Selangor", 3.07, 101.52],
);

test('§5 state "selangor" lists every Selangor store in catalogue order, with no location lookup', async () => {
  const { world, find } = await startWith(selangor);
  expect(storeNames(await find({ state: "selangor" }))).toEqual([
    "Sunway",
    "Shah Alam",
  ]);
  expect(world.geocoder.calls).toEqual([]);
});

test("§5 a state with a leading space or a spelling mistake gives no state match", async () => {
  const { find } = await startWith(selangor);
  expect((await find({ state: " Selangor" })).text).toBe(
    "No store is in this state.",
  );
  expect((await find({ state: "Selangr" })).text).toBe(
    "No store is in this state.",
  );
});

test("§5 a location with a state returns the nearest store, even in a different state", async () => {
  const { world, find } = await startWith(
    stores(
      ["Far", "Selangor", kmNorth(100), 0],
      ["Near", "Johor", kmNorth(10), 0],
    ),
  );
  expect(
    storeNames(await find({ location: "Sunway Pyramid", state: "Selangor" })),
  ).toEqual(["Near"]);
  expect(world.geocoder.calls).toEqual([
    { address: "Sunway Pyramid, Selangor, Malaysia", key: "test-google-key" },
  ]);
});

test("§5 a store at 149.9 km qualifies, and a store at exactly 150 km does not", async () => {
  const near = await startWith(stores(["Edge", "Selangor", kmNorth(149.9), 0]));
  expect(storeNames(await near.find({ location: "Sunway Pyramid" }))).toEqual([
    "Edge",
  ]);
  // The nearest latitude to 150 km that a double holds: the distance computes as 150.00000000000003.
  const far = await startWith(
    stores(["Edge", "Selangor", 1.348982408878096, 0]),
  );
  expect((await far.find({ location: "Sunway Pyramid" })).text).toBe(
    "No store is within 150 km of the location.",
  );
});

test("§5 of two stores at the same distance, the earlier one in the catalogue is returned, and only one store", async () => {
  const { find } = await startWith(
    stores(
      ["North", "A", kmNorth(20), 0],
      ["South", "B", -kmNorth(20), 0],
      ["Other", "C", kmNorth(30), 0],
    ),
  );
  expect(storeNames(await find({ location: "Sunway Pyramid" }))).toEqual([
    "North",
  ]);
});

test("§5 the country gives context and never selects stores of another market, and an empty reference has no fallback", async () => {
  const { world, find } = await startWith(
    stores(["Mid Valley", "Kuala Lumpur", 0, 0]),
    { MARKET: "PH" },
  );
  await find({ location: "Sunway Pyramid", country: "Malaysia" });
  expect(world.geocoder.calls[0]?.address).toBe("Sunway Pyramid, , Malaysia");
  expect(world.s3.reads(keys.stores)).toBe(1);
  expect(world.s3.calls.map((c) => c.key)).not.toContain("PH/Stores.csv");

  const empty = await startWith(stores());
  expect((await empty.find({ location: "Sunway Pyramid" })).text).toBe(
    "No store is within 150 km of the location.",
  );
  expect((await empty.find({ state: "Selangor" })).text).toBe(
    "No store is in this state.",
  );
});

test("§5 every store shows its name, address, map link, phone number, and opening hours as supplied", async () => {
  const { find } = await startWith(selangor);
  expect((await find({ state: "Kuala Lumpur" })).json().stores).toEqual([
    {
      name: "Mid Valley",
      address: "Mid Valley address",
      google_maps_link: "https://maps.app.goo.gl/MidValley",
      phone_number: "012-3456789",
      operating_hours: "10 AM - 10 PM",
    },
  ]);
});

test("§5 the outcomes for missing inputs, an unrecognized location, no nearby store, no state match, a location-service failure, and unusable reference data are distinct", async () => {
  const { world, app, find } = await startWith(
    stores(["Far", "Selangor", 10, 10]),
  );
  world.s3.objects.set(keys.campaigns, campaigns(offer({ name: "Raya" })));
  expect((await find({})).text).toBe("Give a location or a state.");
  expect((await find({ location: "Nowhere" })).text).toBe(
    "The location is not recognized. Ask for a different location.",
  );
  expect((await find({ location: "Sunway Pyramid" })).text).toBe(
    "No store is within 150 km of the location.",
  );
  expect((await find({ state: "Perlis" })).text).toBe(
    "No store is in this state.",
  );

  world.geocoder.fail("down");
  expect(await find({ location: "Sunway Pyramid" })).toMatchObject({
    isError: true,
    text: "The location service is unavailable.",
  });
  world.geocoder.fail("REQUEST_DENIED");
  expect((await find({ location: "Sunway Pyramid" })).isError).toBe(true);
  expect(app.logs.filter((l) => l.event === "geocoding.failed")).toHaveLength(
    2,
  );
  expect(
    app.logs.some((l) => JSON.stringify(l).includes("test-google-key")),
  ).toBe(false);
  expect((await app.call("check_promotions", {})).isError).toBe(false);

  const unusable = await startWith(
    "Store Name,Address,Gmaps Link,Phone Number,Operating Hours,State,Latitude,Longitude\nX,A,L,P,H,Selangor,north,0\n",
  );
  expect(await unusable.find({ state: "Selangor" })).toMatchObject({
    isError: true,
    text: "The stores data is unavailable.",
  });
});
