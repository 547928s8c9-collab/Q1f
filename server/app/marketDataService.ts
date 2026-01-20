import type { Candle, LoadCandlesResult, Timeframe } from "@shared/schema";
import { VALID_TIMEFRAMES } from "@shared/schema";
import { loadCandles } from "../marketData/loadCandles";
import { normalizeTimeframe, timeframeToMs } from "../marketData/utils";
import { ensureCandleRange, buildSyntheticSeed } from "../services/syntheticMarket";
import { storage } from "../storage";

const DEFAULT_MAX_CANDLES = 5000;
const DEFAULT_MAX_RANGE_DAYS = 365;

export interface MarketDataRequest {
  exchange: "synthetic" | "cryptocompare" | string;
  symbol: string;
  timeframe: Timeframe | string;
  fromTs: number;
  toTs: number;
  userId?: string;
  strategyId?: string;
  maxCandles?: number;
  maxRangeDays?: number;
  allowLargeRange?: boolean;
}

function clampRange(fromTs: number, toTs: number, maxRangeDays: number): { fromTs: number; toTs: number } {
  const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
  if (toTs - fromTs <= maxRangeMs) return { fromTs, toTs };
  return { fromTs: toTs - maxRangeMs, toTs };
}

function downsample(candles: Candle[], targetBars: number): Candle[] {
  if (candles.length <= targetBars) return candles;
  const stride = Math.ceil(candles.length / targetBars);
  const buckets: Candle[] = [];

  for (let i = 0; i < candles.length; i += stride) {
    const chunk = candles.slice(i, i + stride);
    if (chunk.length === 0) continue;
    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    const high = Math.max(...chunk.map((c) => c.high));
    const low = Math.min(...chunk.map((c) => c.low));
    const volume = chunk.reduce((sum, c) => sum + c.volume, 0);
    buckets.push({ ts: chunk[0].ts, open, high, low, close, volume });
  }

  return buckets;
}

export async function getMarketCandles(params: MarketDataRequest): Promise<LoadCandlesResult> {
  const timeframe = normalizeTimeframe(params.timeframe);
  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    throw new Error("Invalid timeframe");
  }

  const maxCandles = params.maxCandles ?? DEFAULT_MAX_CANDLES;
  const maxRangeDays = params.maxRangeDays ?? DEFAULT_MAX_RANGE_DAYS;
  const { fromTs, toTs } = clampRange(params.fromTs, params.toTs, maxRangeDays);
  const stepMs = timeframeToMs(timeframe);
  const requestedBars = Math.ceil((toTs - fromTs) / stepMs);

  if (requestedBars <= 0) {
    return { candles: [], gaps: [], source: "cache" };
  }

  if (params.exchange === "synthetic") {
    if (!params.userId || !params.strategyId) {
      throw new Error("Synthetic candles require userId and strategyId");
    }

    const seed = buildSyntheticSeed({
      userId: params.userId,
      strategyId: params.strategyId,
      symbol: params.symbol,
      timeframe,
    });

    await ensureCandleRange({
      exchange: "synthetic",
      symbol: params.symbol,
      timeframe,
      fromTs,
      toTs,
      seed,
    });

    const candles = await storage.getCandlesFromCache("synthetic", params.symbol, timeframe, fromTs, toTs);
    const gaps = [] as LoadCandlesResult["gaps"];
    const downsampled = downsample(candles, maxCandles);

    return { candles: downsampled, gaps, source: "cache+synthetic" };
  }

  const result = await loadCandles({
    exchange: params.exchange,
    symbol: params.symbol,
    timeframe,
    startMs: fromTs,
    endMs: toTs,
    maxBars: params.allowLargeRange ? Math.max(requestedBars, maxCandles) : maxCandles,
    allowLargeRange: params.allowLargeRange,
  });

  const downsampled = downsample(result.candles, maxCandles);

  return {
    ...result,
    candles: downsampled,
  };
}
