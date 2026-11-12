import type { Service } from "../harness.ts";

export type Result = {
  devices: Record<string, string>[];
  message?: string;
  error?: string;
};

export const tool = "check_sale_or_trade_in_value";

export const value = (service: Service, model: string) =>
  service.call(tool, { model }) as Promise<Result>;
