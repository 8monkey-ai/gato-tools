import { stringify } from "csv-stringify/sync";

// Builders for the files that operations publish in object storage.

export type Device = Record<string, unknown>;

export const device = (fields: Device = {}): Device => ({
  category: "iPhone",
  model: "iPhone 12",
  condition: "Used",
  availability: "Stock Present",
  color: "Black",
  storage: "128GB",
  retailPrice: "1500",
  stores: ["Low Yat Plaza"],
  ...fields,
});

export const stockFeed = (...devices: Device[]) => JSON.stringify(devices);

export const csv = (header: string[], rows: string[][]) =>
  stringify([header, ...rows]);

export const stores = (
  ...rows: [name: string, state: string, lat: number, lng: number][]
) =>
  csv(
    [
      "Store Name",
      "Address",
      "Gmaps Link",
      "Phone Number",
      "Operating Hours",
      "State",
      "Latitude",
      "Longitude",
    ],
    rows.map(([name, state, lat, lng]) => [
      name,
      `${name} address`,
      `https://maps.app.goo.gl/${name.replace(/\W/g, "")}`,
      "012-3456789",
      "10 AM - 10 PM",
      state,
      String(lat),
      String(lng),
    ]),
  );

export const offer = (fields: Record<string, unknown> = {}) => ({
  name: "Offer",
  description: "An offer",
  voucher_code: "CODE",
  discount_type: "fixed",
  discount_value: 100,
  min_spend: 0,
  stackable: false,
  priority: 1,
  ...fields,
});

export const campaigns = (...offers: Record<string, unknown>[]) =>
  Bun.YAML.stringify(offers);
