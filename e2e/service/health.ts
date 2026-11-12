import type { Service } from "../harness.ts";

export type Health = {
  status: string;
  failed_sources: string[];
  sources: {
    source: string;
    healthy: boolean;
    revision?: string;
    age_seconds?: number;
    last_failure?: { reason: string; time: string };
  }[];
};

export const health = async (service: Service) => {
  const response = await service.health();
  return { code: response.status, body: (await response.json()) as Health };
};

export const toolCall = (name: string, args: Record<string, unknown>) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name, arguments: args },
});
