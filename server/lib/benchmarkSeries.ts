export type BenchmarkAsset = "SP500" | "BTC" | "GOLD";

const benchmarkConfig: Record<BenchmarkAsset, { drift: number; volatility: number; phase: number }> = {
  SP500: { drift: 0.00045, volatility: 0.008, phase: 0.2 },
  BTC: { drift: 0.0012, volatility: 0.03, phase: 1.1 },
  GOLD: { drift: 0.00025, volatility: 0.006, phase: 2.4 },
};

const toIsoDate = (date: Date) => date.toISOString().split("T")[0];

const dailyReturnFor = (asset: BenchmarkAsset, dayIndex: number) => {
  const { drift, volatility, phase } = benchmarkConfig[asset];
  const wave = Math.sin(dayIndex * 0.65 + phase) * (volatility * 0.55);
  const driftWave = Math.cos(dayIndex * 0.18 + phase) * (volatility * 0.2);
  return drift + wave + driftWave;
};

export interface BenchmarkSeriesPoint {
  asset: BenchmarkAsset;
  timeframeDays: number;
  date: string;
  value: string;
}

export const buildBenchmarkSeries = (asset: BenchmarkAsset, timeframeDays: number, now: Date = new Date()): BenchmarkSeriesPoint[] => {
  const points: BenchmarkSeriesPoint[] = [];
  let value = 100;

  for (let i = timeframeDays; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayIndex = timeframeDays - i;

    if (dayIndex > 0) {
      value *= 1 + dailyReturnFor(asset, dayIndex);
    }

    points.push({
      asset,
      timeframeDays,
      date: toIsoDate(date),
      value: value.toFixed(4),
    });
  }

  return points;
};
