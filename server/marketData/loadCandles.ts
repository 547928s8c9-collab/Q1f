import type { Candle, GapInfo, LoadCandlesResult, Timeframe } from "@shared/schema";
import { VALID_TIMEFRAMES } from "@shared/schema";
import { storage } from "../storage";
import { cryptoCompare } from "../data/cryptoCompare";
import { syntheticDataSource } from "./syntheticDataSource";
import { normalizeSymbol, normalizeTimeframe, timeframeToMs } from "./utils";

function log(msg: string, category?: string, meta?: object) {
  console.log(`[${category || 'marketData'}] ${msg}`, meta ? JSON.stringify(meta) : '');
}

export interface MarketDataSource {
  fetchCandles(symbol: string, timeframe: Timeframe, startMs: number, endMs: number): Promise<Candle[]>;
}

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
};

const DEFAULT_MAX_BARS = 20000;

export interface LoadCandlesParams {
  exchange?: string;
  symbol: string;
  timeframe: Timeframe | string;
  startMs: number;
  endMs: number;
  dataSource?: MarketDataSource;
  maxBars?: number;
  allowLargeRange?: boolean;
  preferSynthetic?: boolean;
}

function getDefaultExchange(exchange: string | undefined, preferSynthetic: boolean | undefined): string {
  if (exchange) return exchange;
  if (preferSynthetic) return "sim";
  if (process.env.MARKET_DATA_MODE === "synthetic") return "sim";
  return "cryptocompare";
}

export async function loadCandles(params: LoadCandlesParams): Promise<LoadCandlesResult> {
  const {
    exchange: exchangeParam,
    symbol: rawSymbol,
    timeframe: rawTimeframe,
    startMs,
    endMs,
    dataSource,
    maxBars = DEFAULT_MAX_BARS,
    allowLargeRange = false,
    preferSynthetic = false,
  } = params;
  const exchange = getDefaultExchange(exchangeParam, preferSynthetic);
  const resolvedDataSource =
    dataSource ?? (exchange === "sim" ? syntheticDataSource : cryptoCompare);

  const symbol = normalizeSymbol(rawSymbol);
  const timeframe = normalizeTimeframe(rawTimeframe as string);

  const stepMs = TIMEFRAME_MS[timeframe];
  const alignedStart = alignToGrid(startMs, stepMs);
  let alignedEnd = alignToGrid(endMs, stepMs);

  if (alignedStart >= alignedEnd) {
    return { candles: [], gaps: [], source: "cache" };
  }

  const requestedBars = Math.ceil((alignedEnd - alignedStart) / stepMs);
  if (requestedBars > maxBars && !allowLargeRange) {
    alignedEnd = alignedStart + maxBars * stepMs;
    log(`loadCandles: Range truncated to ${maxBars} bars`, "marketData", { symbol, timeframe, requestedBars, maxBars });
  }

  let usedNetwork = false;

  const cachedCandles = await storage.getCandlesFromCache(exchange, symbol, timeframe, alignedStart, alignedEnd);

  const missingRanges = findMissingRanges(cachedCandles, alignedStart, alignedEnd, stepMs);

  if (missingRanges.length > 0) {
    usedNetwork = true;
    await fetchAndStoreRanges(exchange, symbol, timeframe, missingRanges, resolvedDataSource);
  }

  let allCandles = await storage.getCandlesFromCache(exchange, symbol, timeframe, alignedStart, alignedEnd);

  const stillMissing = findMissingRanges(allCandles, alignedStart, alignedEnd, stepMs);

  if (stillMissing.length > 0) {
    usedNetwork = true;
    await fetchAndStoreRanges(exchange, symbol, timeframe, stillMissing, resolvedDataSource);
    allCandles = await storage.getCandlesFromCache(exchange, symbol, timeframe, alignedStart, alignedEnd);
  }

  const gaps = buildGaps(allCandles, alignedStart, alignedEnd, stepMs);

  return {
    candles: allCandles,
    gaps,
    source: usedNetwork ? `cache+${exchange}` : "cache",
  };
}

export function alignToGrid(ts: number, stepMs: number): number {
  return Math.floor(ts / stepMs) * stepMs;
}

export function findMissingRanges(
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
  dataSource: MarketDataSource
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

export function buildGaps(
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
