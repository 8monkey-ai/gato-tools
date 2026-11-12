import type { Service } from "../harness.ts";

export type Device = Record<string, string | undefined>;
export type Result = {
  devices: Device[];
  message?: string;
  adjustments?: Record<string, unknown>;
  error?: string;
};

export const check = (service: Service, args: Record<string, unknown>) =>
  service.call("check_availability", args) as Promise<Result>;

export const models = (result: Result) =>
  result.devices.map((device) => device.model);
