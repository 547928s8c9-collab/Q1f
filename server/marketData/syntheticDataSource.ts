import type { Candle, Timeframe } from "@shared/schema";
import type { MarketDataSource } from "./loadCandles";
import { normalizeSymbol } from "./utils";

const BASE_BUCKET_MS = 60_000;
const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

type Pattern =
  | "squeeze_breakout"
  | "mean_revert"
  | "trend_pullback"
  | "vol_burst"
  | "range"
  | "fast_momentum"
  | "deep_dips"
  | "low_vol";

interface SymbolPreset {
  base: number;
  trendPerBucket: number;
  cyclePeriod: number;
  cycleAmp: number;
  noiseAmp: number;
  pattern: Pattern;
  breakoutPeriod?: number;
  squeezeBars?: number;
  breakoutAmp?: number;
  burstPeriod?: number;
  burstBars?: number;
  burstMultiplier?: number;
  pullbackPeriod?: number;
  pullbackAmp?: number;
  rangePeriod?: number;
  rangeAmp?: number;
  momentumPeriod?: number;
  momentumAmp?: number;
  dipPeriod?: number;
  dipBars?: number;
  dipAmp?: number;
  volumeBase: number;
  volumeScale: number;
  volumeNoise: number;
}

const PRESETS: Record<string, SymbolPreset> = {
  BTCUSDT: {
    base: 67000,
    trendPerBucket: 0.35,
    cyclePeriod: 1440,
    cycleAmp: 900,
    noiseAmp: 220,
    pattern: "squeeze_breakout",
    breakoutPeriod: 720,
    squeezeBars: 360,
    breakoutAmp: 2800,
    volumeBase: 1200,
    volumeScale: 55,
    volumeNoise: 220,
  },
  ETHUSDT: {
    base: 3400,
    trendPerBucket: 0.08,
    cyclePeriod: 960,
    cycleAmp: 120,
    noiseAmp: 45,
    pattern: "mean_revert",
    rangePeriod: 320,
    rangeAmp: 95,
    volumeBase: 700,
    volumeScale: 40,
    volumeNoise: 120,
  },
  BNBUSDT: {
    base: 450,
    trendPerBucket: 0.03,
    cyclePeriod: 1100,
    cycleAmp: 18,
    noiseAmp: 10,
    pattern: "trend_pullback",
    pullbackPeriod: 240,
    pullbackAmp: 14,
    volumeBase: 240,
    volumeScale: 18,
    volumeNoise: 60,
  },
  SOLUSDT: {
    base: 165,
    trendPerBucket: 0.05,
    cyclePeriod: 700,
    cycleAmp: 20,
    noiseAmp: 16,
    pattern: "vol_burst",
    burstPeriod: 180,
    burstBars: 20,
    burstMultiplier: 2.8,
    volumeBase: 420,
    volumeScale: 30,
    volumeNoise: 140,
  },
  XRPUSDT: {
    base: 0.62,
    trendPerBucket: 0.00002,
    cyclePeriod: 880,
    cycleAmp: 0.035,
    noiseAmp: 0.01,
    pattern: "range",
    rangePeriod: 220,
    rangeAmp: 0.06,
    volumeBase: 900,
    volumeScale: 18,
    volumeNoise: 120,
  },
  DOGEUSDT: {
    base: 0.17,
    trendPerBucket: 0.00008,
    cyclePeriod: 420,
    cycleAmp: 0.018,
    noiseAmp: 0.012,
    pattern: "fast_momentum",
    momentumPeriod: 60,
    momentumAmp: 0.035,
    volumeBase: 600,
    volumeScale: 26,
    volumeNoise: 180,
  },
  ADAUSDT: {
    base: 0.52,
    trendPerBucket: 0.00003,
    cyclePeriod: 900,
    cycleAmp: 0.03,
    noiseAmp: 0.012,
    pattern: "deep_dips",
    dipPeriod: 520,
    dipBars: 60,
    dipAmp: 0.12,
    volumeBase: 500,
    volumeScale: 22,
    volumeNoise: 140,
  },
  TRXUSDT: {
    base: 0.11,
    trendPerBucket: 0.00001,
    cyclePeriod: 1200,
    cycleAmp: 0.004,
    noiseAmp: 0.0025,
    pattern: "low_vol",
    volumeBase: 350,
    volumeScale: 10,
    volumeNoise: 40,
  },
};

function hashToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rngFromSeed(seed: number): () => number {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function getPreset(symbol: string): SymbolPreset {
  const normalized = normalizeSymbol(symbol);
  return PRESETS[normalized] || PRESETS.BTCUSDT;
}

function basePriceAt(preset: SymbolPreset, bucket: number): number {
  const trend = preset.trendPerBucket * bucket;
  const cycle = Math.sin(bucket / preset.cyclePeriod) * preset.cycleAmp;
  return preset.base + trend + cycle;
}

function patternComponent(preset: SymbolPreset, bucket: number): { offset: number; volMultiplier: number } {
  switch (preset.pattern) {
    case "squeeze_breakout": {
      const period = preset.breakoutPeriod ?? 720;
      const squeezeBars = preset.squeezeBars ?? Math.floor(period / 2);
      const breakoutAmp = preset.breakoutAmp ?? preset.cycleAmp * 2;
      const phase = bucket % period;
      const squeezeFactor = phase < squeezeBars ? 0.25 : 1;
      const impulsePhase = Math.max(0, phase - squeezeBars) / Math.max(1, period - squeezeBars);
      const impulse = Math.sin(Math.min(Math.PI, impulsePhase * Math.PI)) * breakoutAmp;
      return { offset: impulse, volMultiplier: squeezeFactor };
    }
    case "mean_revert": {
      const rangePeriod = preset.rangePeriod ?? 320;
      const rangeAmp = preset.rangeAmp ?? preset.cycleAmp * 0.8;
      const deviation = Math.sin(bucket / rangePeriod) * rangeAmp;
      return { offset: deviation, volMultiplier: 0.8 };
    }
    case "trend_pullback": {
      const pullbackPeriod = preset.pullbackPeriod ?? 240;
      const pullbackAmp = preset.pullbackAmp ?? preset.cycleAmp * 0.9;
      const pullback = -Math.abs(Math.sin(bucket / pullbackPeriod)) * pullbackAmp;
      return { offset: pullback, volMultiplier: 1 };
    }
    case "vol_burst": {
      const burstPeriod = preset.burstPeriod ?? 180;
      const burstBars = preset.burstBars ?? 20;
      const phase = bucket % burstPeriod;
      const burstMultiplier = preset.burstMultiplier ?? 2.5;
      return { offset: 0, volMultiplier: phase < burstBars ? burstMultiplier : 1 };
    }
    case "range": {
      const rangePeriod = preset.rangePeriod ?? 240;
      const rangeAmp = preset.rangeAmp ?? preset.cycleAmp;
      const range = Math.sin(bucket / rangePeriod) * rangeAmp;
      return { offset: range, volMultiplier: 0.6 };
    }
    case "fast_momentum": {
      const momentumPeriod = preset.momentumPeriod ?? 60;
      const momentumAmp = preset.momentumAmp ?? preset.cycleAmp * 1.2;
      const momentum = Math.sin(bucket / momentumPeriod) * momentumAmp;
      return { offset: momentum, volMultiplier: 1.4 };
    }
    case "deep_dips": {
      const dipPeriod = preset.dipPeriod ?? 520;
      const dipBars = preset.dipBars ?? 60;
      const dipAmp = preset.dipAmp ?? preset.cycleAmp * 2;
      const phase = bucket % dipPeriod;
      const dipPhase = phase < dipBars ? Math.sin((phase / dipBars) * Math.PI) : 0;
      const dip = -dipPhase * dipAmp;
      return { offset: dip, volMultiplier: 1.2 };
    }
    case "low_vol":
    default:
      return { offset: 0, volMultiplier: 0.35 };
  }
}

function priceAt(symbol: string, ts: number): number {
  const preset = getPreset(symbol);
  const bucket = Math.floor(ts / BASE_BUCKET_MS);
  const base = basePriceAt(preset, bucket);
  const { offset, volMultiplier } = patternComponent(preset, bucket);
  const seed = hashToSeed(`${symbol}:${bucket}`);
  const rand = rngFromSeed(seed)();
  const noise = (rand - 0.5) * preset.noiseAmp * volMultiplier;
  const raw = base + offset + noise;
  return Math.max(0.0001, raw);
}

function buildCandle(symbol: string, ts: number, stepMs: number): Candle {
  const preset = getPreset(symbol);
  const open = priceAt(symbol, ts);
  const close = priceAt(symbol, ts + stepMs);
  const bucket = Math.floor(ts / BASE_BUCKET_MS);
  const rng = rngFromSeed(hashToSeed(`${symbol}:${bucket}:samples`));
  const sampleCount = 4;
  const samples: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const offset = rng() * stepMs;
    samples.push(priceAt(symbol, ts + offset));
  }
  const highBase = Math.max(open, close, ...samples);
  const lowBase = Math.min(open, close, ...samples);
  const wiggle = (rng() - 0.5) * preset.noiseAmp * 0.25;
  const high = highBase + Math.abs(wiggle);
  const low = Math.max(0.0001, lowBase - Math.abs(wiggle));
  const volumeSeed = rngFromSeed(hashToSeed(`${symbol}:${bucket}:volume`));
  const volumeNoise = (volumeSeed() - 0.5) * preset.volumeNoise;
  const volume = Math.max(
    0,
    preset.volumeBase + Math.abs(close - open) * preset.volumeScale + volumeNoise
  );
  return { ts, open, high, low, close, volume };
}

export const syntheticDataSource: MarketDataSource = {
  async fetchCandles(symbol: string, timeframe: Timeframe, startMs: number, endMs: number): Promise<Candle[]> {
    const stepMs = TIMEFRAME_MS[timeframe];
    const alignedStart = Math.floor(startMs / stepMs) * stepMs;
    const alignedEnd = Math.floor(endMs / stepMs) * stepMs;
    const candles: Candle[] = [];
    for (let ts = alignedStart; ts < alignedEnd; ts += stepMs) {
      candles.push(buildCandle(symbol, ts, stepMs));
    }
    return candles;
  },
};
