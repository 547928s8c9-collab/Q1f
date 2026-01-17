import { describe, it, expect } from "vitest";
import type { Candle } from "@shared/schema";
import { computeDeterministicPrice } from "./priceNoise";

describe("marketSimService deterministic quotes", () => {
  it("produces identical sequences for the same seed", () => {
    const candle: Candle = {
      ts: 0,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000,
    };
    const simTimes = [0, 10_000, 20_000, 30_000, 40_000];
    const seed = "seed-123";

    const seqA = simTimes.map((t) => computeDeterministicPrice(candle, t, "BTCUSDT", seed));
    const seqB = simTimes.map((t) => computeDeterministicPrice(candle, t, "BTCUSDT", seed));

    expect(seqA).toEqual(seqB);
  });
});
