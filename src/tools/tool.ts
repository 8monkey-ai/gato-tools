import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Market } from "../config.ts";
import type { Env } from "../env.ts";
import type { Preparation } from "../preparation.ts";
import type { ObjectStorage, Source } from "../sources/source.ts";

export type ToolContext = {
  env: Env;
  market: Market;
  timezone: string;
  storage: ObjectStorage;
  source<T>(name: string, key: string, parse: (text: string) => T): Source<T>;
  preparation(name: string, run: () => Promise<void>): Preparation;
};

type Tool = {
  register(server: McpServer): void;
  sources: Source<unknown>[];
  preparations: Preparation[];
};

// A factory returns nothing when the tool is not available in the market of the deployment.
export type ToolFactory = (context: ToolContext) => Tool | undefined;

export const reply = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
});

// Request text is short. The limit keeps matching work small.
export const requestText = () => z.string().max(200);
