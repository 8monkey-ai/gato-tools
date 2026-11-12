import { expect, test } from "bun:test";

import { stockCsv } from "../fixtures.ts";
import { type ServiceOptions, startService } from "../harness.ts";
import { health } from "./health.ts";

async function withService(
  files: ServiceOptions["files"],
  run: (service: Awaited<ReturnType<typeof startService>>) => Promise<void>,
) {
  const service = await startService({ market: "MY", files });
  try {
    await run(service);
  } finally {
    await service.stop();
  }
}

const unusable = {
  "Stock.csv": "garbage",
  "Trade-in.csv": "garbage",
  "promotions.yaml": "name: not a list",
};

for (const [kind, files] of [
  ["missing", {}],
  ["unusable", unusable],
] as const) {
  test(`§1 a ${kind} file at startup reports a failure for each source`, () =>
    withService(files, async (service) => {
      const { code, body } = await health(service);
      expect(code).toBe(503);
      expect(body.failed_sources).toEqual(["stock", "trade-in", "promotions"]);
      expect(
        await service.call("check_availability", { model: "iPhone 12" }),
      ).toEqual({
        error: "Stock data is unavailable.",
      });
      expect(
        await service.call("check_sale_or_trade_in_value", {
          model: "iPhone 12",
        }),
      ).toEqual({
        error: "Trade-in data is unavailable.",
      });
      expect(await service.call("check_promotions", {})).toEqual({
        error: "Promotion data is unavailable.",
      });
    }));
}

test("§1 an empty source is valid data", () =>
  withService(
    {
      "Stock.csv": stockCsv([]),
      "Trade-in.csv":
        "Category,Model,ModelNumber,Generation,Size,Storage,Year,Chipset,Material,Connectivity,TradeinPrice",
      "promotions.yaml": "[]",
    },
    async (service) => {
      expect((await health(service)).code).toBe(200);
      expect(await service.call("check_availability", {})).toEqual({
        devices: [],
        message:
          "No device matches the request. Offer other models or preferences.",
      });
    },
  ));
