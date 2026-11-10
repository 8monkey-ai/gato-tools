import { parseCsv } from "../../sources/csv.ts";

const columns = {
  name: "Store Name",
  address: "Address",
  mapLink: "Gmaps Link",
  phone: "Phone Number",
  hours: "Operating Hours",
  state: "State",
} as const;

export type Point = { lat: number; lng: number };

function coordinate(value: string | undefined, column: string) {
  const number = Number(value);
  if (!value?.trim() || !Number.isFinite(number))
    throw new Error(`A store has no usable ${column}`);
  return number;
}

export function parseStores(text: string) {
  return parseCsv(text, [
    ...Object.values(columns),
    "Latitude",
    "Longitude",
  ]).map((row) => ({
    name: row[columns.name] ?? "",
    address: row[columns.address] ?? "",
    mapLink: row[columns.mapLink] ?? "",
    phone: row[columns.phone] ?? "",
    hours: row[columns.hours] ?? "",
    state: row[columns.state] ?? "",
    lat: coordinate(row.Latitude, "Latitude"),
    lng: coordinate(row.Longitude, "Longitude"),
  }));
}

export type Store = ReturnType<typeof parseStores>[number];

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function distanceKm(a: Point, b: Point) {
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Only a store nearer than 150 km qualifies. Of equally near stores, the first in the catalogue wins.
export function nearestStore(stores: Store[], point: Point) {
  let nearest: { store: Store; km: number } | undefined;
  for (const store of stores) {
    const km = distanceKm(point, store);
    if (km < 150 && (!nearest || km < nearest.km)) nearest = { store, km };
  }
  return nearest?.store;
}

export const storesInState = (stores: Store[], state: string) =>
  stores.filter((store) => store.state.toLowerCase() === state.toLowerCase());
