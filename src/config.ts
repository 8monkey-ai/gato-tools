import { findMarket } from "./market.ts";

export function readConfig(env: Record<string, string | undefined>) {
  const market = findMarket(env.GATO_TOOLS_MARKET ?? "");
  if (!market) throw new Error("GATO_TOOLS_MARKET must be MY or PH");
  const mcpBearerToken = env.MCP_BEARER_TOKEN;
  if (!mcpBearerToken) throw new Error("MCP_BEARER_TOKEN is required");
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required");
  const timezone = env.GATO_TOOLS_TIMEZONE || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    throw new Error("GATO_TOOLS_TIMEZONE must be an IANA timezone");
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port)) throw new Error("PORT must be a whole number");
  return { market, timezone, mcpBearerToken, port };
}
