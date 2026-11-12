import type { z, ZodRawShape } from "zod";

import type { Log } from "../log.ts";
import type { Market, MarketCode } from "../market.ts";
import type { Source } from "../sources/source.ts";

export interface SourceFile<T> {
  /** The source name in the health check and the logs. */
  name: string;
  file: string;
  /** The data name in the failure message to the agent. */
  label: string;
  parse: (text: string) => T;
}

export interface ToolEnvironment {
  market: Market;
  /** Today in the configured timezone, as YYYY-MM-DD. */
  today: () => string;
  variables: Record<string, string | undefined>;
  log: Log;
  watch: <T>(source: SourceFile<T>) => Source<T>;
}

export interface ToolDefinition<Shape extends ZodRawShape = ZodRawShape> {
  description: string;
  inputSchema: Shape;
  /** Gives the result data, or throws a ToolError for a failure. */
  handle(input: z.infer<z.ZodObject<Shape>>): Promise<object> | object;
}

export interface Tool {
  name: string;
  markets: MarketCode[];
  setup(environment: ToolEnvironment): ToolDefinition;
}

/** Keeps the input type of `handle` tied to the schema. */
export function defineTool<Shape extends ZodRawShape>(
  definition: ToolDefinition<Shape>,
): ToolDefinition {
  return definition;
}

/** The bound for request text, see SPECS.md section 1. */
export const maxTextLength = 200;
