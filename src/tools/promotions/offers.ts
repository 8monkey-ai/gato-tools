import {
  devicesOf,
  matchesQuery,
  readDescription,
} from "../../matching/catalogue.ts";
import { words } from "../../matching/words.ts";
import type { Campaign, Campaigns } from "./campaigns.ts";

export interface OfferRequest {
  model?: string;
  /** The purchase amount plus the allowance. */
  evaluationAmount: number;
  date: string;
}

/** Gives the applicable offers in their display order. */
export function findOffers(
  campaigns: Campaigns,
  request: OfferRequest,
): Campaign[] {
  const eligible = request.model
    ? eligibleCampaigns(campaigns, request.model)
    : undefined;
  return campaigns.list
    .filter(
      (campaign) =>
        (!campaign.start_date || campaign.start_date <= request.date) &&
        (!campaign.end_date || request.date <= campaign.end_date) &&
        campaign.min_spend <= request.evaluationAmount &&
        (!eligible ||
          !campaign.eligible_models?.length ||
          eligible.has(campaign)),
    )
    .toSorted(
      (a, b) =>
        Number(a.stackable) - Number(b.stackable) ||
        a.priority - b.priority ||
        savings(b, request.evaluationAmount) -
          savings(a, request.evaluationAmount),
    );
}

/** Matches by the recognized model name, else by the original description. */
function eligibleCampaigns(
  { models }: Campaigns,
  model: string,
): Set<Campaign> {
  const query = readDescription(models, model);
  const entries = devicesOf(models);
  const text = words(model).join(" ");
  const matching = query
    ? entries.filter((entry) => matchesQuery(entry, query))
    : entries.filter((entry) => words(entry.name).join(" ") === text);
  return new Set(matching.map((entry) => entry.campaign));
}

function savings(campaign: Campaign, amount: number): number {
  return campaign.discount_type === "fixed"
    ? campaign.discount_value
    : (amount * campaign.discount_value) / 100;
}
