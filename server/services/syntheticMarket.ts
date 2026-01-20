import type { Candle, Timeframe } from "@shared/schema";
import { storage } from "../storage";
import { findMissingRanges } from "../marketData/loadCandles";
import { normalizeSymbol, normalizeTimeframe, timeframeToMs } from "../marketData/utils";

const MAX_STEP_CHANGE_PCT = 0.05;
const MAX_WICK_PCT = 0.02;
const MIN_PRICE = 0.0001;
const BASE_PRICE_MIN = 50;
const BASE_PRICE_MAX = 50000;

export interface EnsureCandleRangeParams {
  exchange: "synthetic";
  symbol: string;
  timeframe: Timeframe | string;
  fromTs: number;
  toTs: number;
  seed: string;
}

export function buildSyntheticSeed(params: {
  userId: string;
  strategyId: string;
  symbol: string;
  timeframe: Timeframe | string;
}): string {
  const symbol = normalizeSymbol(params.symbol);
  const timeframe = normalizeTimeframe(params.timeframe);
  return `${params.userId}:${params.strategyId}:${symbol}:${timeframe}`;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFor(seed: string, ts: number, salt: string): number {
  const rand = mulberry32(hashString(`${seed}:${ts}:${salt}`));
  return rand();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function basePriceForSeed(seed: string, symbol: string, timeframe: Timeframe): number {
  const hash = hashString(`${seed}:${symbol}:${timeframe}:base`);
  const ratio = hash / 0xffffffff;
  return BASE_PRICE_MIN + ratio * (BASE_PRICE_MAX - BASE_PRICE_MIN);
}

function initialPrice(seed: string, symbol: string, timeframe: Timeframe, ts: number): number {
  const base = basePriceForSeed(seed, symbol, timeframe);
  const jitter = (randomFor(seed, ts, "anchor") - 0.5) * 0.2;
  return Math.max(MIN_PRICE, base * (1 + jitter));
}

function buildCandle(seed: string, ts: number, prevClose: number): Candle {
  const changeRaw = (randomFor(seed, ts, "change") * 2 - 1) * MAX_STEP_CHANGE_PCT;
  const change = clamp(changeRaw, -MAX_STEP_CHANGE_PCT, MAX_STEP_CHANGE_PCT);
  const open = prevClose;
  const close = Math.max(MIN_PRICE, open * (1 + change));

  const wickUp = randomFor(seed, ts, "wickUp") * MAX_WICK_PCT;
  const wickDown = randomFor(seed, ts, "wickDown") * MAX_WICK_PCT;
  const high = Math.max(open, close) * (1 + wickUp);
  const low = Math.max(MIN_PRICE, Math.min(open, close) * (1 - wickDown));

  const volumeBase = 100 + randomFor(seed, ts, "volume") * 900;
  const volume = Math.max(1, volumeBase * (1 + Math.abs(change) * 8));

  return {
    ts,
    open,
    high,
    low,
    close,
    volume,
  };
}

function alignStart(ts: number, stepMs: number): number {
  return Math.floor(ts / stepMs) * stepMs;
}

function alignEnd(ts: number, stepMs: number): number {
  return Math.ceil(ts / stepMs) * stepMs;
}

export async function ensureCandleRange(params: EnsureCandleRangeParams): Promise<void> {
  const symbol = normalizeSymbol(params.symbol);
  const timeframe = normalizeTimeframe(params.timeframe);
  const stepMs = timeframeToMs(timeframe);
  const alignedStart = alignStart(params.fromTs, stepMs);
  const alignedEnd = alignEnd(params.toTs, stepMs);

  if (alignedStart >= alignedEnd) {
    return;
  }

  const existing = await storage.getCandlesFromCache(
    params.exchange,
    symbol,
    timeframe,
    alignedStart,
    alignedEnd
  );
  const missingRanges = findMissingRanges(existing, alignedStart, alignedEnd, stepMs);

  if (missingRanges.length === 0) {
    return;
  }

  const knownCandles = await storage.getCandlesFromCache(
    params.exchange,
    symbol,
    timeframe,
    alignedStart - stepMs,
    alignedEnd
  );
  const candleByTs = new Map<number, Candle>(knownCandles.map((c) => [c.ts, c]));

  for (const range of missingRanges) {
    const candles: Candle[] = [];
    let prevClose =
      candleByTs.get(range.startMs - stepMs)?.close ??
      initialPrice(params.seed, symbol, timeframe, range.startMs);

    for (let ts = range.startMs; ts < range.endMs; ts += stepMs) {
      const candle = buildCandle(params.seed, ts, prevClose);
      candles.push(candle);
      prevClose = candle.close;
      candleByTs.set(candle.ts, candle);
    }

    if (candles.length > 0) {
      await storage.upsertCandles(params.exchange, symbol, timeframe, candles);
    }
  }
}
