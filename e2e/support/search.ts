import { afterEach } from "bun:test";

import type { ToolAnswer } from "./app.ts";
import { type Device, stockFeed } from "./data.ts";
import { createWorld, keys, type World } from "./world.ts";

let worlds: World[] = [];
afterEach(async () => {
  await Promise.all(worlds.map((w) => w.close()));
  worlds = [];
});

export function openWorld() {
  const world = createWorld();
  worlds.push(world);
  return world;
}

export async function search(devices: Device[], args: Record<string, unknown>) {
  const world = openWorld();
  world.s3.objects.set(keys.stock, stockFeed(...devices));
  const app = await world.start();
  return app.call("check_availability", args);
}

export const models = (answer: ToolAnswer) =>
  answer.json().devices.map((d) => d.model);
export const prices = (answer: ToolAnswer) =>
  answer.json().devices.map((d) => d.retail_price);
