import { z } from "zod";

import { type Env, parseEnv, seconds } from "./env.ts";
import { protectSecret } from "./log.ts";

const markets = {
  MY: { code: "MY", country: "Malaysia", currency: "RM" },
  PH: { code: "PH", country: "Philippines", currency: "PHP" },
} as const;

export type Market = (typeof markets)[keyof typeof markets];

const schema = z.object({
  MARKET: z.enum(["MY", "PH"]),
  TIMEZONE: z
    .string()
    .default("UTC")
    .refine(
      (zone) =>
        zone === "UTC" || Intl.supportedValuesOf("timeZone").includes(zone),
      { error: "Use an IANA timezone name such as Asia/Kuala_Lumpur" },
    ),
  HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  MCP_BEARER_TOKEN: z.string().min(16),
  S3_ENDPOINT: z.url(),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  SOURCE_MAX_AGE_SECONDS: seconds(300),
  FEED_PREPARATION_INTERVAL_SECONDS: seconds(300),
});

export function readConfig(env: Env) {
  const values = parseEnv(schema, env);
  protectSecret(values.MCP_BEARER_TOKEN);
  protectSecret(values.S3_SECRET_ACCESS_KEY);
  return {
    market: markets[values.MARKET],
    timezone: values.TIMEZONE,
    port: values.HTTP_PORT,
    bearerToken: values.MCP_BEARER_TOKEN,
    s3: {
      endpoint: values.S3_ENDPOINT,
      bucket: values.S3_BUCKET,
      region: values.S3_REGION,
      accessKeyId: values.S3_ACCESS_KEY_ID,
      secretAccessKey: values.S3_SECRET_ACCESS_KEY,
    },
    sourceMaxAgeMs: values.SOURCE_MAX_AGE_SECONDS * 1000,
    preparationIntervalMs: values.FEED_PREPARATION_INTERVAL_SECONDS * 1000,
  };
}
