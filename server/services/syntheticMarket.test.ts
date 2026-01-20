import { describe, it, expect } from "vitest";
import { buildSyntheticSeed, generateSyntheticCandles } from "./syntheticMarket";
import { timeframeToMs } from "../marketData/utils";

const HOUR_MS = timeframeToMs("1h");

describe("generateSyntheticCandles", () => {
  it("is deterministic for the same seed", () => {
    const seed = buildSyntheticSeed({
      userId: "user-1",
      strategyId: "strategy-1",
      symbol: "BTCUSDT",
      timeframe: "1h",
    });

    const first = generateSyntheticCandles({
      seed,
      symbol: "BTCUSDT",
      timeframe: "1h",
      fromTs: 0,
      toTs: HOUR_MS * 5,
    });

    const second = generateSyntheticCandles({
      seed,
      symbol: "BTCUSDT",
      timeframe: "1h",
      fromTs: 0,
      toTs: HOUR_MS * 5,
    });

    expect(second).toEqual(first);
  });

  it("enforces bounded step changes and valid OHLC", () => {
    const seed = buildSyntheticSeed({
      userId: "user-2",
      strategyId: "strategy-2",
      symbol: "ETHUSDT",
      timeframe: "1h",
    });

    const candles = generateSyntheticCandles({
      seed,
      symbol: "ETHUSDT",
      timeframe: "1h",
      fromTs: 0,
      toTs: HOUR_MS * 10,
    });

    for (let i = 1; i < candles.length; i += 1) {
      const prev = candles[i - 1];
      const curr = candles[i];
      const change = Math.abs(curr.close / prev.close - 1);
      expect(change).toBeLessThanOrEqual(0.05);
      expect(curr.low).toBeLessThanOrEqual(curr.open);
      expect(curr.low).toBeLessThanOrEqual(curr.close);
      expect(curr.high).toBeGreaterThanOrEqual(curr.open);
      expect(curr.high).toBeGreaterThanOrEqual(curr.close);
    }
  });

  it("creates contiguous, aligned candles without duplicates", () => {
    const seed = buildSyntheticSeed({
      userId: "user-3",
      strategyId: "strategy-3",
      symbol: "SOLUSDT",
      timeframe: "1h",
    });

    const candles = generateSyntheticCandles({
      seed,
      symbol: "SOLUSDT",
      timeframe: "1h",
      fromTs: HOUR_MS,
      toTs: HOUR_MS * 6,
    });

    const seen = new Set<number>();
    candles.forEach((candle, index) => {
      expect(candle.ts % HOUR_MS).toBe(0);
      expect(seen.has(candle.ts)).toBe(false);
      seen.add(candle.ts);
      if (index > 0) {
        expect(candle.ts - candles[index - 1].ts).toBe(HOUR_MS);
      }
    });
  });
});
