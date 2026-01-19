import { describe, expect, it } from "vitest";
import { buildBenchmarkSeries, buildStrategySeries } from "./performance";
import type { Candle, StrategyPerformance } from "@shared/schema";

const makePerformance = (overrides: Partial<StrategyPerformance>): StrategyPerformance => ({
  id: "perf-1",
  strategyId: "strategy-1",
  day: 1,
  date: "2024-01-01",
  equityMinor: "1000000000",
  benchmarkBtcMinor: null,
  benchmarkEthMinor: null,
  ...overrides,
});

const makeCandle = (overrides: Partial<Candle>): Candle => ({
  ts: Date.UTC(2024, 0, 1),
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1000,
  ...overrides,
});

describe("buildStrategySeries", () => {
  it("normalizes equity to a 100 base", () => {
    const performance = [
      makePerformance({ date: "2024-01-01", equityMinor: "100" }),
      makePerformance({ day: 2, date: "2024-01-02", equityMinor: "110" }),
    ];

    const result = buildStrategySeries(performance);
    expect(result[0]).toEqual({ date: "2024-01-01", value: 100 });
    expect(result[1]?.date).toBe("2024-01-02");
    expect(result[1]?.value).toBeCloseTo(110, 6);
  });
});

describe("buildBenchmarkSeries", () => {
  it("aligns candle closes to performance dates and carries forward", () => {
    const performance = [
      makePerformance({ date: "2024-01-01" }),
      makePerformance({ day: 2, date: "2024-01-02" }),
      makePerformance({ day: 3, date: "2024-01-03" }),
    ];
    const candles = [
      makeCandle({ ts: Date.UTC(2024, 0, 1), close: 200 }),
      makeCandle({ ts: Date.UTC(2024, 0, 3), close: 220 }),
    ];

    const result = buildBenchmarkSeries(performance, candles);
    expect(result[0]).toEqual({ date: "2024-01-01", value: 100 });
    expect(result[1]).toEqual({ date: "2024-01-02", value: 100 });
    expect(result[2]?.date).toBe("2024-01-03");
    expect(result[2]?.value).toBeCloseTo(110, 6);
  });
});
