import { log } from "../log.ts";

export type ObjectStorage = {
  read(key: string): Promise<string>;
  write(key: string, text: string): Promise<void>;
};

export type Source<T> = {
  name: string;
  load(): Promise<void>;
  get(): Promise<T>;
  status(): Record<string, unknown>;
};

const iso = (time: number | undefined) =>
  time === undefined ? undefined : new Date(time).toISOString();

class StoredSource<T> implements Source<T> {
  private current?: { value: T; revision: string; loadedAt: number };
  private attemptedAt = 0;
  private failure?: { at: number; error: string };
  private loading?: Promise<void>;

  constructor(
    readonly name: string,
    private readonly options: {
      key: string;
      storage: ObjectStorage;
      maxAgeMs: number;
      parse: (text: string) => T;
    },
  ) {}

  // Only a complete, parsed version replaces the current one. A failure keeps the current version.
  private async refresh() {
    const { key, storage, parse } = this.options;
    this.attemptedAt = Date.now();
    try {
      const text = await storage.read(key);
      const value = parse(text);
      const revision = Bun.hash(text).toString(16);
      this.current = { value, revision, loadedAt: Date.now() };
      this.failure = undefined;
      log.info("source.loaded", { source: this.name, revision });
    } catch (error) {
      this.failure = {
        at: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
      const event = this.current
        ? "source.refresh_failed"
        : "source.load_failed";
      log.error(event, { source: this.name, key, error });
    }
  }

  load() {
    this.loading ??= this.refresh().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  async get() {
    if (!this.current) await this.load();
    if (!this.current) throw new Error(`The ${this.name} data is unavailable.`);
    if (Date.now() - this.attemptedAt >= this.options.maxAgeMs)
      void this.load();
    return this.current.value;
  }

  status() {
    const { current, failure } = this;
    return {
      key: this.options.key,
      revision: current?.revision,
      loadedAt: iso(current?.loadedAt),
      ageSeconds: current && Math.floor((Date.now() - current.loadedAt) / 1000),
      failure: failure && { at: iso(failure.at), error: failure.error },
    };
  }
}

export const createSource = <T>(options: {
  name: string;
  key: string;
  storage: ObjectStorage;
  maxAgeMs: number;
  parse: (text: string) => T;
}): Source<T> => new StoredSource(options.name, options);
