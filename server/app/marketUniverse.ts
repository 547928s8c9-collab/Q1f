import type { Timeframe } from "@shared/schema";

export interface MarketDefinition {
  exchange: string;
  symbol: string;
  timeframe: Timeframe;
}

export async function getMarketUniverse(storage: any): Promise<MarketDefinition[]> {
  return [];
}
