import { describe, expect, it } from "vitest";
import type { Timeframe } from "@shared/schema";
import { storage } from "../storage";
import { buildSyntheticSeed, ensureCandleRange } from "./syntheticMarket";

const HOUR_MS = 60 * 60 * 1000;

describe("syntheticMarket", () => {
  it("generates deterministic candles with clamped step changes", async () => {
    const timeframe: Timeframe = "1h";
    const seed = buildSyntheticSeed({
      userId: "user-1",
      strategyId: "strategy-1",
      symbol: "BTCUSDT",
      timeframe,
    });

    await ensureCandleRange({
      exchange: "synthetic",
      symbol: "BTCUSDT",
      timeframe,
      fromTs: 0,
      toTs: 5 * HOUR_MS,
      seed,
    });

    const candles = await storage.getCandlesFromCache(
      "synthetic",
      "BTCUSDT",
      timeframe,
      0,
      5 * HOUR_MS
    );

    expect(candles).toHaveLength(5);

    for (let i = 0; i < candles.length; i += 1) {
      const candle = candles[i];
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.low).toBeGreaterThan(0);
    }

    for (let i = 1; i < candles.length; i += 1) {
      const prev = candles[i - 1];
      const curr = candles[i];
      const pctChange = (curr.close - prev.close) / prev.close;
      expect(Math.abs(pctChange)).toBeLessThanOrEqual(0.05 + 1e-10);
    }

    await ensureCandleRange({
      exchange: "synthetic",
      symbol: "BTCUSDT",
      timeframe,
      fromTs: 0,
      toTs: 5 * HOUR_MS,
      seed,
    });

    const candlesAgain = await storage.getCandlesFromCache(
      "synthetic",
      "BTCUSDT",
      timeframe,
      0,
      5 * HOUR_MS
    );

    expect(candlesAgain).toEqual(candles);
  });
});
