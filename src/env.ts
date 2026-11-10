import { z } from "zod";

export type Env = Record<string, string | undefined>;

export const seconds = (fallback: number) =>
  z.coerce.number().positive().default(fallback);

export function parseEnv<T extends z.ZodType>(schema: T, env: Env): z.infer<T> {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  throw new Error(`Invalid configuration:\n${problems.join("\n")}`);
}
