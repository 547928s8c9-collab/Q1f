import type { Candle, LoadCandlesResult, Timeframe } from "@shared/schema";
import { VALID_TIMEFRAMES } from "@shared/schema";
import { loadCandles } from "../marketData/loadCandles";
import { normalizeTimeframe, timeframeToMs } from "../marketData/utils";
import { ensureCandleRange, buildSyntheticSeed, generateSyntheticCandles } from "../services/syntheticMarket";
import { storage } from "../storage";
import { ensureHistoryFor } from "../market/binanceVisionImporter";
import { logger } from "../lib/logger";

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

  const maxCandles = Math.min(params.maxCandles ?? DEFAULT_MAX_CANDLES, 10000); // Hard cap at 10k
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

  // DB-first: try to get candles from database
  const dbCandles = await storage.getCandlesFromCache(
    params.exchange || "binance_spot",
    params.symbol,
    timeframe,
    fromTs,
    toTs
  );
  
  const expectedBars = requestedBars;
  const actualBars = dbCandles.length;
  const coverageThreshold = 0.8; // 80% coverage required
  const hasEnoughCoverage = actualBars >= expectedBars * coverageThreshold;
  
  let source: "db" | "db_partial" | "synthetic" = "db";
  let finalCandles = dbCandles;
  const gaps: LoadCandlesResult["gaps"] = [];
  
  if (!hasEnoughCoverage && actualBars === 0 && params.exchange === "binance_spot") {
    // No data at all: try quick import (current month, last 7 days, max 3 seconds)
    try {
      const importPromise = ensureHistoryFor(
        params.symbol,
        timeframe,
        { monthsBack: 0, daysBackForCurrentMonth: 7 },
        storage
      );
      
      // Race: import vs timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Import timeout")), 3000);
      });
      
      await Promise.race([importPromise, timeoutPromise]);
      
      // Re-fetch from DB
      const importedCandles = await storage.getCandlesFromCache(
        "binance_spot",
        params.symbol,
        timeframe,
        fromTs,
        toTs
      );
      
      if (importedCandles.length > 0) {
        finalCandles = importedCandles;
        source = "db_partial";
      } else {
        // Still no data: fallback to synthetic
        source = "synthetic";
        finalCandles = await generateSyntheticCandles({
          seed: `market:${params.symbol}:${timeframe}`,
          symbol: params.symbol,
          timeframe,
          fromTs,
          toTs,
          exchange: "binance_spot",
        });
      }
    } catch (err) {
      logger.warn("Import failed, using synthetic fallback", "market-data", {
        symbol: params.symbol,
        timeframe,
        error: err,
      });
      source = "synthetic";
      finalCandles = await generateSyntheticCandles({
        seed: `market:${params.symbol}:${timeframe}`,
        symbol: params.symbol,
        timeframe,
        fromTs,
        toTs,
        exchange: "binance_spot",
      });
    }
  } else if (!hasEnoughCoverage && actualBars > 0) {
    // Partial coverage: trigger async import, return what we have
    source = "db_partial";
    
    // Trigger async import (fire and forget)
    ensureHistoryFor(
      params.symbol,
      timeframe,
      { monthsBack: 6, daysBackForCurrentMonth: 14 },
      storage
    ).catch((err) => {
      logger.warn("Async import failed", "market-data", { symbol: params.symbol, timeframe, error: err });
    });
    
    // Build gaps
    const candleSet = new Set(finalCandles.map((c) => c.ts));
    let gapStart: number | null = null;
    for (let ts = fromTs; ts < toTs; ts += stepMs) {
      if (!candleSet.has(ts)) {
        if (gapStart === null) gapStart = ts;
      } else {
        if (gapStart !== null) {
          gaps.push({
            startMs: gapStart,
            endMs: ts,
            reason: "missing_candles",
          });
          gapStart = null;
        }
      }
    }
    if (gapStart !== null) {
      gaps.push({
        startMs: gapStart,
        endMs: toTs,
        reason: "missing_candles",
      });
    }
  } else if (hasEnoughCoverage) {
    // Good coverage from DB
    source = "db";
  } else {
    // Fallback to synthetic
    source = "synthetic";
    finalCandles = await generateSyntheticCandles({
      seed: `market:${params.symbol}:${timeframe}`,
      symbol: params.symbol,
      timeframe,
      fromTs,
      toTs,
      exchange: params.exchange || "binance_spot",
    });
  }
  
  const downsampled = downsample(finalCandles, maxCandles);
  
  return {
    candles: downsampled,
    gaps,
    source,
  };
}
