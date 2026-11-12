import { availabilityTool } from "./availability/tool.ts";
import { locationTool } from "./location/tool.ts";
import { promotionsTool } from "./promotions/tool.ts";
import type { Tool } from "./tool.ts";
import { tradeInTool } from "./trade-in/tool.ts";

export const tools: Tool[] = [
  availabilityTool,
  tradeInTool,
  promotionsTool,
  locationTool,
];
