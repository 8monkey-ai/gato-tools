import { type App, startApp } from "./app.ts";
import { startFakeGeocoder } from "./fake-geocoder.ts";
import { startFakeS3 } from "./fake-s3.ts";

export const keys = {
  stock: "data/Stock.json",
  tradeIn: "MY/Trade-in.csv",
  campaigns: "data/promotions.yaml",
  stores: "MY/Stores.csv",
};

export const token = "test-mcp-bearer-token";

export type World = Awaited<ReturnType<typeof createWorld>>;

export function createWorld() {
  const s3 = startFakeS3();
  const geocoder = startFakeGeocoder();
  s3.objects.set(keys.stock, "[]");
  s3.objects.set(
    keys.tradeIn,
    "Category,Model,ModelNumber,Storage,Year,TradeinPrice\n",
  );
  s3.objects.set(keys.campaigns, "");
  s3.objects.set(
    keys.stores,
    "Store Name,Address,Gmaps Link,Phone Number,Operating Hours,State,Latitude,Longitude\n",
  );
  const apps: App[] = [];
  const baseEnv = {
    MARKET: "MY",
    HTTP_PORT: "0",
    MCP_BEARER_TOKEN: token,
    S3_ENDPOINT: s3.endpoint,
    S3_BUCKET: s3.bucket,
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-access-key",
    STOCK_FEED_KEY: keys.stock,
    TRADE_IN_REFERENCE_KEY: keys.tradeIn,
    CAMPAIGNS_KEY: keys.campaigns,
    STORES_KEY: keys.stores,
    GOOGLE_MAPS_API_KEY: geocoder.apiKey,
    GOOGLE_MAPS_GEOCODING_URL: geocoder.url,
  };
  return {
    s3,
    geocoder,
    baseEnv,
    async start(extra: Record<string, string | undefined> = {}) {
      const env = Object.fromEntries(
        Object.entries({ ...baseEnv, ...extra }).filter(
          ([, v]) => v !== undefined,
        ),
      ) as Record<string, string>;
      const app = await startApp(env);
      apps.push(app);
      return app;
    },
    async close() {
      await Promise.all(apps.map((app) => app.stop()));
      await Promise.all([s3.stop(), geocoder.stop()]);
    },
  };
}
