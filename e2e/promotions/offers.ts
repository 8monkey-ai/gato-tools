import { type CampaignFixture, promotionsYaml } from "../fixtures.ts";
import { sampleFiles, type Service, useService } from "../harness.ts";

export type Offer = Record<string, unknown>;
export type Result = { promotions: Offer[]; message?: string; error?: string };

export function useCampaigns(
  campaigns: () => CampaignFixture[],
  options: { market?: "MY" | "PH"; timezone?: string } = {},
) {
  return useService(async () => ({
    market: options.market ?? "MY",
    timezone: options.timezone,
    files: {
      ...(await sampleFiles()),
      "promotions.yaml": promotionsYaml(campaigns()),
    },
  }));
}

export const promotions = (service: Service, args: Record<string, unknown>) =>
  service.call("check_promotions", args) as Promise<Result>;

export const offerNames = async (
  service: Service,
  args: Record<string, unknown>,
) => (await promotions(service, args)).promotions.map((offer) => offer.name);

export const dateIn = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

/** One campaign for today in Pacific/Kiritimati (UTC+14) and one for today in UTC. */
export const todayCampaigns = (): CampaignFixture[] => [
  {
    name: "Kiritimati today",
    start_date: dateIn("Pacific/Kiritimati"),
    end_date: dateIn("Pacific/Kiritimati"),
  },
  { name: "UTC today", start_date: dateIn("UTC"), end_date: dateIn("UTC") },
];
