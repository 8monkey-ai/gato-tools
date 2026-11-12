import { expect, test } from "bun:test";

import { readConfig } from "./config.ts";

const valid = {
  GATO_TOOLS_MARKET: "PH",
  MCP_BEARER_TOKEN: "t",
  S3_BUCKET: "b",
};

test.each([
  [{ GATO_TOOLS_MARKET: "SG" }, "GATO_TOOLS_MARKET must be MY or PH"],
  [{ MCP_BEARER_TOKEN: "" }, "MCP_BEARER_TOKEN is required"],
  [{ S3_BUCKET: undefined }, "S3_BUCKET is required"],
  [
    { GATO_TOOLS_TIMEZONE: "Mars/Base" },
    "GATO_TOOLS_TIMEZONE must be an IANA timezone",
  ],
  [{ PORT: "eighty" }, "PORT must be a whole number"],
])("an invalid setting stops the startup: %o", (change, message) => {
  expect(() => readConfig({ ...valid, ...change })).toThrow(message);
});
