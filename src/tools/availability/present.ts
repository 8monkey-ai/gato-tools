import type { StockRow } from "./stock.ts";

const optionalFields = [
  "color",
  "storage",
  "size",
  "generation",
  "material",
  "connectivity",
  "year",
  "chipset",
  "ram",
] as const;

export function presentDevice(row: StockRow, currency: string) {
  const money = (amount: string) => `${currency} ${amount}`;
  const entry: Record<string, unknown> = {
    model: row.model,
    condition: row.condition,
  };
  for (const key of optionalFields) if (row[key]) entry[key] = row[key];
  entry.availability = row.availability;
  if (row.availability.toLowerCase() !== "out of stock")
    entry.available_stores = row.stores.join(", ") || "Online Only";
  entry.retail_price = money(row.retailPrice);
  if (row.promotionPrice) entry.promotion_price = money(row.promotionPrice);
  if (row.lastMonthPrice) entry.last_month_price = money(row.lastMonthPrice);
  if (row.otherPrices.length) {
    entry.other_prices = Object.fromEntries(
      row.otherPrices.map((p) => [
        p.name,
        `${money(p.amount)}${p.monthly ? "/month" : ""}`,
      ]),
    );
  }
  if (row.checkoutLink) entry.checkout_link = row.checkoutLink;
  const video =
    row.videoLinks[Math.floor(Math.random() * row.videoLinks.length)];
  if (video) entry.video_link = video;
  return entry;
}
