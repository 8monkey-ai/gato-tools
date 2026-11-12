import type { Log } from "../log.ts";
import { ToolError } from "../tool-error.ts";

export interface StoredFile {
  revision: string;
  modified: Date;
}

/** Read-only access to the files in the source bucket. */
export interface FileStore {
  /** Gives undefined when the file does not exist. */
  stat: (key: string) => Promise<StoredFile | undefined>;
  read: (key: string) => Promise<string>;
}

export interface SourceStatus {
  source: string;
  healthy: boolean;
  revision?: string;
  age_seconds?: number;
  last_failure?: { reason: string; time: string };
}

export interface Source<T> {
  /** Gives the loaded version, or throws a ToolError that names the data. */
  current(): T;
}

export interface WatchedSource<T> extends Source<T> {
  refresh(): Promise<void>;
  status(now: Date): SourceStatus;
}

export interface SourceFile<T> {
  /** The source name in the health check and the logs. */
  name: string;
  file: string;
  /** The data name in the failure message to the agent. */
  label: string;
  parse: (text: string) => T;
}

const timeoutMs = 30_000;

export function watchSource<T>(
  { name, file, label, parse }: SourceFile<T>,
  store: FileStore,
  log: Log,
): WatchedSource<T> {
  const state: State<T> = { ok: false };
  let running: Promise<void> | undefined;
  return {
    current() {
      if (!state.loaded) throw new ToolError(`${label} data is unavailable.`);
      return state.loaded.value;
    },
    refresh() {
      running ??= load(state, { name, file, parse }, store, log).finally(
        () => (running = undefined),
      );
      return running;
    },
    status: (now) => describe(name, state, now),
  };
}

interface State<T> {
  loaded?: StoredFile & { value: T };
  /** The revision of the last load that read the file. */
  attempted?: string;
  ok: boolean;
  failure?: { reason: string; revision?: string; time: Date };
}

type Loader<T> = Omit<SourceFile<T>, "label">;

async function load<T>(
  state: State<T>,
  { name, file, parse }: Loader<T>,
  store: FileStore,
  log: Log,
) {
  const fail = (reason: string, revision?: string, error?: unknown) => {
    const { failure } = state;
    if (
      state.ok ||
      failure?.reason !== reason ||
      failure.revision !== revision
    ) {
      state.failure = { reason, revision, time: new Date() };
      const detail = error instanceof Error ? error.message : undefined;
      log("error", "source_load_failed", {
        source: name,
        revision,
        reason,
        error: detail,
      });
    }
    state.ok = false;
  };
  try {
    const stored = await withTimeout(store.stat(file));
    if (!stored) {
      state.attempted = undefined;
      return fail("file missing");
    }
    if (stored.revision === state.attempted) return;
    const text = await withTimeout(store.read(file));
    state.attempted = stored.revision;
    try {
      state.loaded = { ...stored, value: parse(text) };
    } catch (error) {
      return fail("file unusable", stored.revision, error);
    }
    state.ok = true;
    log("info", "source_loaded", { source: name, revision: stored.revision });
  } catch (error) {
    fail("file unreadable", undefined, error);
  }
}

function describe<T>(source: string, state: State<T>, now: Date): SourceStatus {
  const { loaded, failure } = state;
  return {
    source,
    healthy: Boolean(loaded) && state.ok,
    revision: loaded?.revision,
    age_seconds: loaded
      ? Math.floor((now.getTime() - loaded.modified.getTime()) / 1000)
      : undefined,
    last_failure: failure && {
      reason: failure.reason,
      time: failure.time.toISOString(),
    },
  };
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: Timer | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
