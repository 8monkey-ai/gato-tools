import { z } from "zod";

import { parseEnv } from "../../env.ts";
import { log, protectSecret } from "../../log.ts";
import { reply, requestText, type ToolFactory } from "../tool.ts";
import { type Geocode, googleGeocoder } from "./geocode.ts";
import {
  nearestStore,
  parseStores,
  type Store,
  storesInState,
} from "./stores.ts";

const settings = z.object({
  STORES_KEY: z.string().min(1),
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  GOOGLE_MAPS_GEOCODING_URL: z
    .url()
    .default("https://maps.googleapis.com/maps/api/geocode/json"),
});

const present = (store: Store) => ({
  name: store.name,
  address: store.address,
  google_maps_link: store.mapLink,
  phone_number: store.phone,
  operating_hours: store.hours,
});

const input = {
  location: requestText()
    .optional()
    .describe('Customer location, for example "Sunway Pyramid".'),
  state: requestText().optional().describe('State, for example "Selangor".'),
  country: requestText()
    .optional()
    .describe("Country. Default: the market of the service."),
};

async function locate(geocode: Geocode, address: string) {
  try {
    return await geocode(address);
  } catch (error) {
    log.error("geocoding.failed", { error });
    throw new Error("The location service is unavailable.", { cause: error });
  }
}

export const stores: ToolFactory = (context) => {
  const env = parseEnv(settings, context.env);
  protectSecret(env.GOOGLE_MAPS_API_KEY);
  const geocode = googleGeocoder(
    env.GOOGLE_MAPS_API_KEY,
    env.GOOGLE_MAPS_GEOCODING_URL,
  );
  const reference = context.source("stores", env.STORES_KEY, parseStores);
  async function nearby(
    location: string,
    state = "",
    country: string = context.market.country,
  ) {
    const all = await reference.get();
    const point = await locate(geocode, `${location}, ${state}, ${country}`);
    if (!point)
      return reply(
        "The location is not recognized. Ask for a different location.",
      );
    const nearest = nearestStore(all, point);
    return nearest
      ? reply({ stores: [present(nearest)] })
      : reply("No store is within 150 km of the location.");
  }
  async function inState(state: string) {
    const found = storesInState(await reference.get(), state);
    return found.length
      ? reply({ stores: found.map(present) })
      : reply("No store is in this state.");
  }
  return {
    sources: [reference],
    preparations: [],
    register(server) {
      server.registerTool(
        "find_closest_store",
        {
          description:
            "Find the nearest store to a location, or list the stores in a state. A location takes precedence over the state.",
          inputSchema: input,
        },
        ({ location, state, country }) => {
          if (location) return nearby(location, state, country);
          if (state) return inState(state);
          return reply("Give a location or a state.");
        },
      );
    },
  };
};
