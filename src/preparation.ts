import { log } from "./log.ts";

export type Preparation = {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Record<string, unknown>;
};

export function createPreparation(
  name: string,
  intervalMs: number,
  run: () => Promise<void>,
): Preparation {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let stopped = false;
  let last: { at: string; error?: string } | undefined;

  async function once() {
    try {
      await run();
      last = { at: new Date().toISOString() };
      log.info("preparation.published", { preparation: name });
    } catch (error) {
      last = {
        at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
      log.error("preparation.failed", { preparation: name, error });
    }
  }

  // The next run is scheduled only after the previous one ends, so runs never overlap.
  async function loop() {
    running = once();
    await running;
    if (!stopped) timer = setTimeout(() => void loop(), intervalMs);
  }

  return {
    name,
    start: loop,
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
    status: () => ({ lastRun: last }),
  };
}
