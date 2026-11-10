import { z } from "zod";

import { parseEnv } from "../../env.ts";
import { parseQuery } from "../../matching/query.ts";
import { reply, requestText, type ToolFactory } from "../tool.ts";
import {
  applicableOffers,
  type Campaign,
  parseCampaigns,
  spendAllowance,
} from "./campaigns.ts";

const settings = z.object({ CAMPAIGNS_KEY: z.string().min(1) });

const today = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function present(c: Campaign, currency: string) {
  return {
    name: c.name,
    description: c.description,
    voucher_code: c.voucher_code ?? null,
    ...(c.eligible_models?.length
      ? { eligible_models: c.eligible_models }
      : {}),
    ...(c.start_date ? { start_date: c.start_date } : {}),
    ...(c.end_date ? { end_date: c.end_date } : {}),
    stackable: c.stackable,
    priority: c.priority,
    discount:
      c.discount_type === "fixed"
        ? `${currency} ${Math.trunc(c.discount_value)}`
        : `${Math.trunc(c.discount_value)}%`,
    min_spend: `${currency} ${Math.trunc(c.min_spend)}`,
  };
}

const input = {
  model: requestText()
    .optional()
    .describe(
      'Device, for example "iPhone 15 Pro 256GB". Omit it for offers on all models.',
    ),
  purchase_amount: z
    .number()
    .nonnegative()
    .optional()
    .describe("Purchase amount. Default 9999."),
  purchase_date: z.iso
    .date()
    .optional()
    .describe("Purchase date as YYYY-MM-DD. Default today."),
};

export const promotions: ToolFactory = (context) => {
  const env = parseEnv(settings, context.env);
  const campaigns = context.source(
    "campaigns",
    env.CAMPAIGNS_KEY,
    parseCampaigns,
  );
  return {
    sources: [campaigns],
    preparations: [],
    register(server) {
      server.registerTool(
        "check_promotions",
        {
          description:
            "List the promotions that apply to a purchase, with their restrictions. This tool does not apply discounts.",
          inputSchema: input,
        },
        async ({ model, purchase_amount = 9999, purchase_date }) => {
          const product = model?.trim()
            ? (parseQuery(model)?.model ?? model)
            : undefined;
          const offers = applicableOffers(await campaigns.get(), {
            product,
            amount: purchase_amount,
            date: purchase_date ?? today(context.timezone),
          });
          if (!offers.length)
            return reply("No promotions apply to the request.");
          return reply({
            promotions: offers.map((c) => present(c, context.market.currency)),
            note: `Offers are listed when their minimum spend is at most the purchase amount plus ${spendAllowance}, so the customer can be below the minimum spend. Only stackable offers can be combined.`,
          });
        },
      );
    },
  };
};
