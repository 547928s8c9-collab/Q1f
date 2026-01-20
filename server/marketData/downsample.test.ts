import { describe, expect, it } from "vitest";
import type { Candle } from "@shared/schema";
import { aggregateCandles, resolveDownsampleTimeframe } from "./downsample";

function makeCandle(ts: number, overrides: Partial<Candle> = {}): Candle {
  return {
    ts,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    ...overrides,
  };
}

describe("resolveDownsampleTimeframe", () => {
  it("keeps timeframe when range is within max bars", () => {
    const result = resolveDownsampleTimeframe({
      timeframe: "15m",
      startMs: 0,
      endMs: 6 * 60 * 60 * 1000,
      maxBars: 50,
    });

    expect(result).toBe("15m");
  });

  it("promotes timeframe when range exceeds max bars", () => {
    const result = resolveDownsampleTimeframe({
      timeframe: "15m",
      startMs: 0,
      endMs: 90 * 24 * 60 * 60 * 1000,
      maxBars: 3000,
    });

    expect(result).toBe("1h");
  });
});

describe("aggregateCandles", () => {
  it("aggregates candles into larger timeframe buckets", () => {
    const baseTs = 0;
    const candles: Candle[] = [
      makeCandle(baseTs, { open: 10, high: 12, low: 9, close: 11, volume: 5 }),
      makeCandle(baseTs + 15 * 60 * 1000, { open: 11, high: 13, low: 10, close: 12, volume: 6 }),
      makeCandle(baseTs + 30 * 60 * 1000, { open: 12, high: 14, low: 11, close: 13, volume: 7 }),
      makeCandle(baseTs + 45 * 60 * 1000, { open: 13, high: 15, low: 12, close: 14, volume: 8 }),
    ];

    const aggregated = aggregateCandles(candles, "15m", "1h");

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]).toEqual({
      ts: 0,
      open: 10,
      high: 15,
      low: 9,
      close: 14,
      volume: 26,
    });
  });

  it("returns sorted candles when not downsampling", () => {
    const candles: Candle[] = [
      makeCandle(30, { close: 2 }),
      makeCandle(0, { close: 1 }),
    ];

    const result = aggregateCandles(candles, "1h", "15m");
    expect(result.map((c) => c.ts)).toEqual([0, 30]);
  });
});
