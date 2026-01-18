import { describe, it, expect } from "vitest";
import { syntheticDataSource } from "./syntheticDataSource";

const MINUTE_MS = 60_000;

describe("syntheticDataSource", () => {
  it("is deterministic for same inputs", async () => {
    const start = 0;
    const end = 15 * MINUTE_MS * 12;
    const first = await syntheticDataSource.fetchCandles("BTCUSDT", "15m", start, end);
    const second = await syntheticDataSource.fetchCandles("BTCUSDT", "15m", start, end);
    expect(second).toEqual(first);
  });

  it("produces continuous candles without gaps", async () => {
    const start = 0;
    const end = 60 * MINUTE_MS;
    const candles = await syntheticDataSource.fetchCandles("ETHUSDT", "1m", start, end);
    expect(candles).toHaveLength(60);
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].ts - candles[i - 1].ts).toBe(MINUTE_MS);
    }
  });

  it("respects candle sanity constraints", async () => {
    const start = 0;
    const end = 15 * MINUTE_MS * 8;
    const candles = await syntheticDataSource.fetchCandles("SOLUSDT", "15m", start, end);
    for (const candle of candles) {
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.volume).toBeGreaterThanOrEqual(0);
    }
  });
});
