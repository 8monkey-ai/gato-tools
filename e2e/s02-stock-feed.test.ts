import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { waitUntil } from "./support/app.ts";
import { csv, device, stockFeed } from "./support/data.ts";
import { models, openWorld } from "./support/search.ts";
import { keys, type World } from "./support/world.ts";

const exportKey = "data/Stock.csv";
const mappings = {
  products: {
    U_IPHONE: { category: "iPhone" },
    N_IPHONE: { category: "iPhone" },
    U_IPAD_WC: { category: "iPad", specs: { connectivity: "WiFi+Cellular" } },
  },
  branches: [
    { column: "WangsaWalkMall", name: "[Klang Valley] Wangsa Walk Mall" },
    { column: "LowYatPlaza", name: "[Klang Valley] Low Yat Plaza" },
  ],
  prices: [
    { column: "XOXBundlePrice", name: "xox_bundle_price" },
    { column: "SpaylaterPrice", name: "spaylater_price", monthly: true },
  ],
};

const header = [
  "Category",
  "Condition",
  "Model",
  "Color",
  "Storage",
  "Total Stock",
  "Low Yat Plaza",
  "Wangsa Walk Mall",
  "RetailPrice",
  "PromotionPrice",
  "XOXBundlePrice",
  "SpaylaterPrice",
  "CheckoutLink",
  "VideoLink",
];
type Line = Partial<Record<(typeof header)[number], string>>;
const line = (fields: Line) =>
  header.map(
    (name) =>
      fields[name] ??
      {
        Category: "U_IPHONE",
        Condition: "Used",
        Model: "iPhone 12 128GB Black",
        Color: "Black",
        Storage: "128GB",
        "Total Stock": "5",
        "Low Yat Plaza": "1",
        "Wangsa Walk Mall": "1",
        RetailPrice: "1500",
      }[name] ??
      "",
  );
const stockExport = (...lines: Line[]) => csv(header, lines.map(line));

async function startPreparing(
  exported: string,
  extra: Record<string, string> = {},
  before: (world: World) => void = () => {},
) {
  const world = openWorld();
  const dir = await mkdtemp(join(tmpdir(), "gato-tools-"));
  const mappingsFile = join(dir, "stock-mappings.json");
  await Bun.write(mappingsFile, JSON.stringify(mappings));
  world.s3.objects.set(exportKey, exported);
  before(world);
  const app = await world.start({
    STOCK_EXPORT_KEY: exportKey,
    STOCK_FEED_MAPPINGS_FILE: mappingsFile,
    ...extra,
  });
  return { world, app };
}

const published = (world: World) =>
  JSON.parse(world.s3.objects.get(keys.stock) ?? "[]") as Record<
    string,
    unknown
  >[];

test('§2 quantities "0", "4", "10", "30", "100", and blank give the stock status by text order', async () => {
  const quantities = ["0", "4", "10", "30", "100", ""];
  const { world } = await startPreparing(
    stockExport(...quantities.map((q) => ({ "Total Stock": q }))),
  );
  expect(published(world).map((row) => row.availability)).toEqual([
    "Out of Stock",
    "Stock Present",
    "Low Stock",
    "Stock Present",
    "Low Stock",
    "Low Stock",
  ]);
});

test('§2 a blank branch entry includes the branch, "0" excludes it, and the mappings give the branch order', async () => {
  const { world, app } = await startPreparing(
    stockExport(
      { "Low Yat Plaza": "", "Wangsa Walk Mall": "2" },
      { "Low Yat Plaza": "3", "Wangsa Walk Mall": "0" },
    ),
  );
  expect(published(world).map((row) => row.stores)).toEqual([
    ["[Klang Valley] Wangsa Walk Mall", "[Klang Valley] Low Yat Plaza"],
    ["[Klang Valley] Low Yat Plaza"],
  ]);
  const answer = await app.call("check_availability", { model: "iPhone 12" });
  expect(answer.json().devices[0]?.available_stores).toBe(
    "[Klang Valley] Wangsa Walk Mall, [Klang Valley] Low Yat Plaza",
  );
});

const mixedExport = stockExport(
  {
    Condition: "New",
    PromotionPrice: "1400",
    XOXBundlePrice: "1300",
    SpaylaterPrice: "125",
  },
  {
    Condition: "Refurbished",
    Model: "iPhone 12 128GB Black (Used)",
    CheckoutLink: "https://x.example/c",
    VideoLink: "https://v.example/1,0",
  },
  {
    Category: "U_IPAD_WC",
    Model: "iPad Pro 11-inch 256GB Silver",
    Color: "Silver",
    Storage: "256GB",
  },
  { Category: "U_UNKNOWN", Model: "Other" },
);

test("§2 preparation keeps the product mappings, supplied specifications, prices, and links, and only explicit new stock is new", async () => {
  const { world, app } = await startPreparing(mixedExport);
  expect(published(world)).toMatchObject([
    {
      category: "iPhone",
      model: "iPhone 12",
      condition: "New",
      color: "Black",
      storage: "128GB",
      promotionPrice: "1400",
      otherPrices: [
        { name: "xox_bundle_price", amount: "1300", monthly: false },
        { name: "spaylater_price", amount: "125", monthly: true },
      ],
    },
    {
      model: "iPhone 12",
      condition: "Used",
      checkoutLink: "https://x.example/c",
      videoLinks: ["https://v.example/1"],
    },
    {
      category: "iPad",
      model: "iPad Pro",
      size: '11"',
      connectivity: "WiFi+Cellular",
    },
  ]);
  expect(published(world)).toHaveLength(3);
  const answer = await app.call("check_availability", {
    model: "New iPhone 12",
  });
  expect(answer.json().devices[0]).toMatchObject({
    other_prices: {
      xox_bundle_price: "RM 1300",
      spaylater_price: "RM 125/month",
    },
  });
});

test("§2 preparation runs about every interval and its runs never overlap", async () => {
  const { world } = await startPreparing(
    stockExport({}),
    { FEED_PREPARATION_INTERVAL_SECONDS: "0.05" },
    (w) => w.s3.delays.set(exportKey, 200),
  );
  await waitUntil(
    () => world.s3.writes(keys.stock) >= 3,
    3000,
    "three publications",
  );
  expect(world.s3.mostActive.get(exportKey)).toBe(1);
});

test("§2 without an export key, the service publishes nothing", async () => {
  const world = openWorld();
  const app = await world.start();
  await app.call("check_availability", {});
  expect(world.s3.calls.filter((c) => c.method === "PUT")).toEqual([]);
});

test("§2 an unusable export publishes nothing, and the previous feed stays in service", async () => {
  const { world, app } = await startPreparing(
    "Category,Model\nU_IPHONE,iPhone 12\n",
    {},
    (w) =>
      w.s3.objects.set(keys.stock, stockFeed(device({ model: "iPhone 11" }))),
  );
  expect(world.s3.writes(keys.stock)).toBe(0);
  expect(models(await app.call("check_availability", {}))).toEqual([
    "iPhone 11",
  ]);
  const health = await app.health();
  expect(health.preparations.stock.lastRun?.error).toStartWith(
    "Missing columns: Condition, TotalStock",
  );
});
