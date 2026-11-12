import { expect, test } from "bun:test";

import { sampleFiles, startService, waitFor } from "../harness.ts";

test("§1 on a stop signal, running requests finish and then the service stops", async () => {
  const service = await startService({
    market: "MY",
    files: await sampleFiles(),
  });
  const late = {
    formatted_address: "Late",
    geometry: { location: { lat: 1, lng: 2 } },
  };
  service.geocoding.reply({
    delayMs: 1000,
    body: { status: "OK", results: [late] },
  });
  const running = service.call("find_location", {
    user_location: "Sunway Pyramid",
  });
  await waitFor(() => (service.geocoding.calls.length ? true : undefined));
  service.child.kill("SIGTERM");
  expect(await running).toEqual({
    locations: [{ latitude: 1, longitude: 2, formatted_address: "Late" }],
  });
  expect(await service.child.exited).toBe(0);
  expect(service.logs.lines.at(-1)?.event).toBe("shutdown");
  await service.stop();
});
