import { z } from "zod";

import { defineTool, maxTextLength, type Tool } from "../tool.ts";
import { geocode } from "./geocoding.ts";

const description = `Finds the latitude, longitude, and formatted address of a place that the customer names.
Compare the coordinates with the store locations that you know to find the nearest store.
The state and the country give context to the lookup. They do not restrict the result, so the result can be in another state or country.`;

const text = z.string().max(maxTextLength).optional();

export const locationTool: Tool = {
  name: "find_location",
  markets: ["MY", "PH"],
  setup({ market, variables, log }) {
    const key = variables.GOOGLE_GEOCODING_API_KEY;
    if (!key) throw new Error("GOOGLE_GEOCODING_API_KEY is required");
    const url =
      variables.GOOGLE_GEOCODING_URL ||
      "https://maps.googleapis.com/maps/api/geocode/json";
    return defineTool({
      description,
      inputSchema: {
        user_location: text.describe(
          "The place, for example a mall, a street, or a town",
        ),
        state: text.describe("The state, as context"),
        country: text.describe(
          "The country, as context. The market country by default",
        ),
      },
      async handle({ user_location, state, country }) {
        const place = user_location?.trim();
        if (!place)
          return {
            locations: [],
            message: "The location is missing. Ask for a location.",
          };
        const address = [
          place,
          state?.trim(),
          country?.trim() || market.country,
        ]
          .filter(Boolean)
          .join(", ");
        const found = await geocode({ url, key, log }, address);
        if (!found)
          return {
            locations: [],
            message:
              "The location is not recognized. Ask for a more specific place.",
          };
        return { locations: [found] };
      },
    });
  },
};
