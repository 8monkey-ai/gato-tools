import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import type { Log } from "./log.ts";
import { ToolError } from "./tool-error.ts";
import type { ToolDefinition } from "./tools/tool.ts";

export type NamedTool = ToolDefinition & { name: string };

/** Answers one MCP request. The service keeps no session between requests. */
export async function handleMcp(
  request: Request,
  tools: NamedTool[],
  log: Log,
): Promise<Response> {
  const server = new McpServer({ name: "gato-tools", version: "1.0.0" });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      (input) => callTool(tool, input, log),
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

async function callTool(
  tool: NamedTool,
  input: Parameters<NamedTool["handle"]>[0],
  log: Log,
) {
  const started = performance.now();
  const duration_ms = () => Math.round(performance.now() - started);
  try {
    const result = await tool.handle(input);
    log("info", "tool_call", {
      tool: tool.name,
      outcome: "ok",
      duration_ms: duration_ms(),
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  } catch (error) {
    const known = error instanceof ToolError;
    log(known ? "warn" : "error", "tool_call", {
      tool: tool.name,
      outcome: "error",
      duration_ms: duration_ms(),
      error: known ? error.message : String(error),
    });
    const message = known ? error.message : "The tool failed.";
    return {
      isError: true,
      content: [{ type: "text" as const, text: message }],
    };
  }
}
