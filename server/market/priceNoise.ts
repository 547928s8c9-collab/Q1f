import type { Candle } from "@shared/schema";

const ONE_MINUTE_MS = 60_000;
const MAX_UINT32 = 0x100000000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededUnitFloat(seed: string, symbol: string, candleTs: number, simNow: number): number {
  const key = `${seed}:${symbol}:${candleTs}:${simNow}`;
  return hashString32(key) / MAX_UINT32;
}

export function computeDeterministicPrice(
  candle: Candle,
  simNow: number,
  symbol: string,
  seed: string
): number {
  const progress = clamp((simNow - candle.ts) / ONE_MINUTE_MS, 0, 1);
  const base = candle.open + (candle.close - candle.open) * progress;
  const range = Math.max(0.000001, candle.high - candle.low);
  const noise = (seededUnitFloat(seed, symbol, candle.ts, simNow) - 0.5) * range * 0.2;
  return clamp(base + noise, candle.low, candle.high);
}
