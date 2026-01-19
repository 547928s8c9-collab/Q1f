import { describe, it, expect } from "vitest";
import { buildBenchmarkSeries } from "./benchmarkSeries";

describe("buildBenchmarkSeries", () => {
  it("builds deterministic normalized series for a timeframe", () => {
    const now = new Date("2024-06-01T00:00:00.000Z");
    const series = buildBenchmarkSeries("SP500", 7, now);

    expect(series).toHaveLength(8);
    expect(series[0]).toMatchObject({
      asset: "SP500",
      timeframeDays: 7,
      date: "2024-05-25",
      value: "100.0000",
    });
    expect(series[series.length - 1].date).toBe("2024-06-01");

    const secondRun = buildBenchmarkSeries("SP500", 7, now);
    expect(secondRun).toEqual(series);
  });
});
