import { z } from "zod";

import { formatAmount, type Market } from "../../market.ts";
import { defineTool, maxTextLength, type Tool } from "../tool.ts";
import { type Campaign, readCampaigns } from "./campaigns.ts";
import { findOffers } from "./offers.ts";

const description = `Lists the promotions that apply to a purchase, and offers that almost apply.
The tool compares each minimum spend with the purchase amount plus 500, so an offer in the result does not mean that the customer qualifies at the actual spend. An omitted purchase amount is evaluated as 9999.
An omitted purchase date means today. Without a model, the result includes offers for specific models and shows their eligible_models.
Offers with stackable false cannot be combined with other offers. Listing offers together does not mean that they can be combined. The tool does not apply discounts.`;

export const promotionsTool: Tool = {
  name: "check_promotions",
  markets: ["MY", "PH"],
  setup({ market, today, watch }) {
    const campaigns = watch({
      name: "promotions",
      file: "promotions.yaml",
      label: "Promotion",
      parse: readCampaigns,
    });
    return defineTool({
      description,
      inputSchema: {
        model: z
          .string()
          .max(maxTextLength)
          .optional()
          .describe("Device description"),
        purchase_amount: z
          .number()
          .nonnegative()
          .optional()
          .describe("Purchase amount"),
        purchase_date: z.iso
          .date()
          .optional()
          .describe("Purchase date, YYYY-MM-DD"),
      },
      handle(input) {
        const offers = findOffers(campaigns.current(), {
          model: input.model?.trim() || undefined,
          evaluationAmount: (input.purchase_amount ?? 9999) + 500,
          date: input.purchase_date ?? today(),
        });
        if (!offers.length)
          return {
            promotions: [],
            message: "No promotion applies to the request.",
          };
        return {
          promotions: offers.map((offer) => formatOffer(market, offer)),
        };
      },
    });
  },
};

function formatOffer(market: Market, campaign: Campaign) {
  const discount = Math.trunc(campaign.discount_value);
  return {
    name: campaign.name,
    description: campaign.description,
    voucher_code: campaign.voucher_code,
    eligible_models: campaign.eligible_models?.join(", ") || undefined,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    stackable: campaign.stackable,
    priority: campaign.priority,
    discount:
      campaign.discount_type === "fixed"
        ? formatAmount(market, discount)
        : `${discount}%`,
    min_spend: formatAmount(market, Math.trunc(campaign.min_spend)),
  };
}
