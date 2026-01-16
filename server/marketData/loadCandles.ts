import type { Candle, GapInfo, LoadCandlesResult, Timeframe } from "@shared/schema";
import { VALID_TIMEFRAMES } from "@shared/schema";
import { storage } from "../storage";
import { binanceSpot, BinanceSpotDataSource } from "../data/binanceSpot";

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "15m": 900000,
  "1h": 3600000,
  "1d": 86400000,
};

export interface LoadCandlesParams {
  exchange?: string;
  symbol: string;
  timeframe: Timeframe;
  startMs: number;
  endMs: number;
  dataSource?: BinanceSpotDataSource;
}

export async function loadCandles(params: LoadCandlesParams): Promise<LoadCandlesResult> {
  const {
    exchange = "binance_spot",
    symbol,
    timeframe,
    startMs,
    endMs,
    dataSource = binanceSpot,
  } = params;

  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    throw new Error(`Invalid timeframe: ${timeframe}`);
  }

  const stepMs = TIMEFRAME_MS[timeframe];
  const alignedStart = alignToGrid(startMs, stepMs);
  const alignedEnd = alignToGrid(endMs, stepMs);

  if (alignedStart >= alignedEnd) {
    return { candles: [], gaps: [], source: "cache" };
  }

  let usedNetwork = false;

  const cachedCandles = await storage.getCandlesFromCache(exchange, symbol, timeframe, alignedStart, alignedEnd);

  const missingRanges = findMissingRanges(cachedCandles, alignedStart, alignedEnd, stepMs);

  if (missingRanges.length > 0) {
    usedNetwork = true;
    await fetchAndStoreRanges(exchange, symbol, timeframe, missingRanges, dataSource);
  }

  let allCandles = await storage.getCandlesFromCache(exchange, symbol, timeframe, alignedStart, alignedEnd);

  const stillMissing = findMissingRanges(allCandles, alignedStart, alignedEnd, stepMs);

  if (stillMissing.length > 0) {
    usedNetwork = true;
    await fetchAndStoreRanges(exchange, symbol, timeframe, stillMissing, dataSource);
    allCandles = await storage.getCandlesFromCache(exchange, symbol, timeframe, alignedStart, alignedEnd);
  }

  const gaps = buildGaps(allCandles, alignedStart, alignedEnd, stepMs);

  return {
    candles: allCandles,
    gaps,
    source: usedNetwork ? "cache+binance" : "cache",
  };
}

function alignToGrid(ts: number, stepMs: number): number {
  return Math.floor(ts / stepMs) * stepMs;
}

function findMissingRanges(
  candles: Candle[],
  startMs: number,
  endMs: number,
  stepMs: number
): Array<{ startMs: number; endMs: number }> {
  const candleSet = new Set(candles.map((c) => c.ts));
  const ranges: Array<{ startMs: number; endMs: number }> = [];

  let rangeStart: number | null = null;

  for (let ts = startMs; ts < endMs; ts += stepMs) {
    if (!candleSet.has(ts)) {
      if (rangeStart === null) {
        rangeStart = ts;
      }
    } else {
      if (rangeStart !== null) {
        ranges.push({ startMs: rangeStart, endMs: ts });
        rangeStart = null;
      }
    }
  }

  if (rangeStart !== null) {
    ranges.push({ startMs: rangeStart, endMs });
  }

  return ranges;
}

async function fetchAndStoreRanges(
  exchange: string,
  symbol: string,
  timeframe: Timeframe,
  ranges: Array<{ startMs: number; endMs: number }>,
  dataSource: BinanceSpotDataSource
): Promise<void> {
  for (const range of ranges) {
    try {
      const candles = await dataSource.fetchCandles(symbol, timeframe, range.startMs, range.endMs);
      if (candles.length > 0) {
        await storage.upsertCandles(exchange, symbol, timeframe, candles);
      }
    } catch (err) {
      console.error(`Failed to fetch candles for ${symbol} ${timeframe} [${range.startMs}-${range.endMs}]:`, err);
    }
  }
}

function buildGaps(
  candles: Candle[],
  startMs: number,
  endMs: number,
  stepMs: number
): GapInfo[] {
  const candleSet = new Set(candles.map((c) => c.ts));
  const gaps: GapInfo[] = [];

  let gapStart: number | null = null;

  for (let ts = startMs; ts < endMs; ts += stepMs) {
    if (!candleSet.has(ts)) {
      if (gapStart === null) {
        gapStart = ts;
      }
    } else {
      if (gapStart !== null) {
        gaps.push({
          startMs: gapStart,
          endMs: ts,
          reason: "missing_candles_after_retry",
        });
        gapStart = null;
      }
    }
  }

  if (gapStart !== null) {
    gaps.push({
      startMs: gapStart,
      endMs,
      reason: "missing_candles_after_retry",
    });
  }

  return gaps;
}
