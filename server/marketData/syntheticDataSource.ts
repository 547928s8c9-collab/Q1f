import type { Candle, Timeframe } from "@shared/schema";
import type { MarketDataSource } from "./loadCandles";
import { normalizeSymbol, timeframeToMs } from "./utils";

type SymbolPreset = {
  base: number;
  trend: number;
  vol: number;
  cycle: number;
  cycleAmp: number;
  volumeFactor: number;
  baseVolume: number;
  wiggle: number;
};

const BASE_SEED = 1337;

const PRESETS: Record<string, SymbolPreset> = {
  BTC: { base: 28000, trend: 1.2, vol: 140, cycle: 90, cycleAmp: 300, volumeFactor: 24, baseVolume: 180, wiggle: 35 },
  ETH: { base: 1800, trend: 0.35, vol: 18, cycle: 70, cycleAmp: 50, volumeFactor: 18, baseVolume: 120, wiggle: 8 },
  BNB: { base: 320, trend: 0.18, vol: 6, cycle: 80, cycleAmp: 12, volumeFactor: 10, baseVolume: 70, wiggle: 3 },
  SOL: { base: 22, trend: 0.12, vol: 1.4, cycle: 45, cycleAmp: 3.5, volumeFactor: 9, baseVolume: 60, wiggle: 0.6 },
  XRP: { base: 0.52, trend: 0.00004, vol: 0.02, cycle: 85, cycleAmp: 0.05, volumeFactor: 160, baseVolume: 55, wiggle: 0.008 },
  DOGE: { base: 0.08, trend: 0.0002, vol: 0.004, cycle: 35, cycleAmp: 0.01, volumeFactor: 260, baseVolume: 50, wiggle: 0.002 },
  ADA: { base: 0.36, trend: 0.00005, vol: 0.01, cycle: 95, cycleAmp: 0.03, volumeFactor: 130, baseVolume: 65, wiggle: 0.004 },
  TRX: { base: 0.12, trend: 0.00002, vol: 0.003, cycle: 110, cycleAmp: 0.01, volumeFactor: 110, baseVolume: 40, wiggle: 0.0015 },
};

const DEFAULT_PRESET: SymbolPreset = {
  base: 120,
  trend: 0.08,
  vol: 4,
  cycle: 80,
  cycleAmp: 10,
  volumeFactor: 12,
  baseVolume: 50,
  wiggle: 2,
};

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

function randomFor(symbol: string, bucket: number, salt: string): number {
  const seed = hashString(`${BASE_SEED}:${symbol}:${bucket}:${salt}`);
  return mulberry32(seed)();
}

function noiseFor(symbol: string, bucket: number, salt: string): number {
  return randomFor(symbol, bucket, salt) * 2 - 1;
}

function presetKeyForSymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  return normalized.replace(/(USDT|USDC|USD|BUSD|DAI|TUSD|EUR|GBP|JPY|RUB|AUD|CAD)$/i, "");
}

function priceAt(symbol: string, ts: number, stepMs: number): number {
  const key = presetKeyForSymbol(symbol);
  const preset = PRESETS[key] ?? DEFAULT_PRESET;
  const bucket = Math.floor(ts / stepMs);
  const t = bucket;
  const base = preset.base + preset.trend * t;
  const cycle = Math.sin(t / preset.cycle) * preset.cycleAmp;
  const baseNoise = noiseFor(key, bucket, "base");

  let price = base + cycle + baseNoise * preset.vol;

  switch (key) {
    case "BTC": {
      const phase = bucket % 120;
      const isBreakout = phase >= 85;
      const volScale = isBreakout ? 2.6 : 0.35;
      const breakoutImpulse = isBreakout
        ? Math.sin(((phase - 85) / 35) * Math.PI) * preset.vol * 6
        : 0;
      price = base + cycle + breakoutImpulse + baseNoise * preset.vol * volScale;
      break;
    }
    case "ETH": {
      const ema = base + Math.sin(t / 50) * preset.cycleAmp;
      const deviation = Math.sin(t / 6) * preset.vol;
      price = ema + deviation * 0.6 + baseNoise * preset.vol * 0.4;
      break;
    }
    case "BNB": {
      const pullback = Math.sin(t / 12) * preset.vol * -1.2;
      price = base + cycle + pullback + baseNoise * preset.vol * 0.8;
      break;
    }
    case "SOL": {
      const burstPhase = bucket % 40;
      const burst = burstPhase < 6;
      const burstBoost = burst ? 2.8 : 0.6;
      const impulse = Math.sin(t / 4) * preset.vol * (burst ? 1.6 : 0.4);
      price = base + cycle + impulse + baseNoise * preset.vol * burstBoost;
      break;
    }
    case "XRP": {
      const rangeCenter = base + Math.sin(t / 70) * preset.cycleAmp;
      const range = Math.sin(t / 8) * preset.vol;
      price = rangeCenter + range + baseNoise * preset.vol * 0.3;
      break;
    }
    case "DOGE": {
      const momentum = Math.sin(t / 3) * preset.vol * 1.4 + Math.sin(t / 1.7) * preset.vol * 0.6;
      price = base + cycle + momentum + baseNoise * preset.vol * 1.2;
      break;
    }
    case "ADA": {
      const dipPhase = bucket % 90;
      const dip = dipPhase < 12 ? -Math.exp(-dipPhase / 4) * preset.vol * 5 : 0;
      price = base + cycle + dip + baseNoise * preset.vol * 0.7;
      break;
    }
    case "TRX": {
      price = base + cycle * 0.4 + baseNoise * preset.vol * 0.25;
      break;
    }
    default:
      break;
  }

  return Math.max(0.0001, price);
}

function buildCandle(symbol: string, timeframe: Timeframe, ts: number): Candle {
  const stepMs = timeframeToMs(timeframe);
  const key = presetKeyForSymbol(symbol);
  const preset = PRESETS[key] ?? DEFAULT_PRESET;
  const open = priceAt(symbol, ts, stepMs);
  const close = priceAt(symbol, ts + stepMs, stepMs);

  const bucket = Math.floor(ts / stepMs);
  const sampleCount = 3 + Math.floor(randomFor(key, bucket, "samples") * 3);
  const samplePrices: number[] = [open, close];

  for (let i = 0; i < sampleCount; i += 1) {
    const offset = (i + 1) / (sampleCount + 1);
    const sampleTs = ts + offset * stepMs;
    const wiggle = noiseFor(key, bucket, `wiggle-${i}`) * preset.wiggle;
    samplePrices.push(priceAt(symbol, sampleTs, stepMs) + wiggle);
  }

  const high = Math.max(...samplePrices);
  const low = Math.min(...samplePrices);

  const move = Math.abs(close - open);
  const volumeNoise = noiseFor(key, bucket, "volume");
  const volume = Math.max(1, preset.baseVolume + move * preset.volumeFactor + move * volumeNoise * 0.35);

  return {
    ts,
    open,
    high,
    low,
    close,
    volume,
  };
}

export const syntheticDataSource: MarketDataSource = {
  async fetchCandles(symbol: string, timeframe: Timeframe, startMs: number, endMs: number): Promise<Candle[]> {
    const stepMs = timeframeToMs(timeframe);
    const candles: Candle[] = [];
    for (let ts = startMs; ts < endMs; ts += stepMs) {
      candles.push(buildCandle(symbol, timeframe, ts));
    }
    return candles;
  },
};
