// The set of markets is closed (SPECS.md section 1), so one table names them all.
const markets = {
  MY: { currency: "RM", country: "Malaysia" },
  PH: { currency: "PHP", country: "Philippines" },
};

export type MarketCode = keyof typeof markets;
export type Market = (typeof markets)[MarketCode] & { code: MarketCode };

export function findMarket(code: string): Market | undefined {
  if (!Object.hasOwn(markets, code)) return undefined;
  const market = code as MarketCode;
  return { code: market, ...markets[market] };
}

export function formatAmount(market: Market, amount: string | number): string {
  return `${market.currency} ${amount}`;
}
