import { z } from "zod";

import { modelMatches } from "../../matching/model.ts";

const campaign = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  voucher_code: z.string().nullish(),
  discount_type: z.enum(["fixed", "percentage"]),
  discount_value: z.number().nonnegative(),
  min_spend: z.number().nonnegative().default(0),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
  stackable: z.boolean().default(false),
  eligible_models: z.array(z.string().min(1)).optional(),
  priority: z.number().int().default(0),
});

export type Campaign = z.infer<typeof campaign>;

// An empty file is a valid list with no campaigns.
export const parseCampaigns = (text: string) =>
  z.array(campaign).parse(Bun.YAML.parse(text) ?? []);

// Offers that are near the purchase amount are listed too, so the agent can mention them.
export const spendAllowance = 500;

export function applicableOffers(
  campaigns: Campaign[],
  request: { product?: string; amount: number; date: string },
) {
  const evaluated = request.amount + spendAllowance;
  const { product, date } = request;
  const saving = (c: Campaign) =>
    c.discount_type === "percentage"
      ? (evaluated * c.discount_value) / 100
      : c.discount_value;
  return campaigns
    .filter(
      (c) =>
        (!c.start_date || date >= c.start_date) &&
        (!c.end_date || date <= c.end_date) &&
        c.min_spend <= evaluated &&
        (!product ||
          !c.eligible_models?.length ||
          c.eligible_models.some((m) => modelMatches(product, m))),
    )
    .sort(
      (a, b) =>
        Number(a.stackable) - Number(b.stackable) ||
        a.priority - b.priority ||
        saving(b) - saving(a),
    );
}
