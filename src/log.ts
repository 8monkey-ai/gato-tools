type Level = "info" | "warn" | "error";

export type Log = (
  level: Level,
  event: string,
  fields?: Record<string, unknown>,
) => void;

export const log: Log = (level, event, fields) => {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }),
  );
};
