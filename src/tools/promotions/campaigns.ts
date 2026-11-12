import { z } from "zod";

import {
  buildCatalogue,
  type Catalogue,
  type Device,
} from "../../matching/catalogue.ts";
import { readGenericSpecs } from "../../matching/specs.ts";
import { words } from "../../matching/words.ts";

const campaignSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  voucher_code: z.string().optional(),
  discount_type: z.enum(["fixed", "percentage"]),
  discount_value: z.number().nonnegative(),
  min_spend: z.number().nonnegative().default(0),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
  stackable: z.boolean(),
  eligible_models: z.array(z.string()).optional(),
  priority: z.number(),
});

export type Campaign = z.infer<typeof campaignSchema>;

export interface EligibleModel extends Device {
  /** The eligible model as the campaign gives it. */
  name: string;
  campaign: Campaign;
}

export interface Campaigns {
  list: Campaign[];
  /** The eligible models of all campaigns, read as a device catalogue. */
  models: Catalogue<EligibleModel>;
}

export function readCampaigns(text: string): Campaigns {
  const list = z.array(campaignSchema).parse(Bun.YAML.parse(text) ?? []);
  const models = list.flatMap((campaign) =>
    (campaign.eligible_models ?? []).map((name) => {
      const { specs, rest } = readGenericSpecs(name);
      // The brand word is the category, so that it is optional as in the stock catalogue.
      return {
        category: words(rest)[0] ?? "",
        model: rest,
        specs,
        name,
        campaign,
      };
    }),
  );
  return { list, models: buildCatalogue(models) };
}
