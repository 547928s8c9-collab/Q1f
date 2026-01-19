import type { Candle, StrategyPerformance } from "@shared/schema";

export interface IndexedPoint {
  date: string;
  value: number;
}

const toDateKey = (value: string | number) => new Date(value).toISOString().slice(0, 10);

export const buildStrategySeries = (performance: StrategyPerformance[]): IndexedPoint[] => {
  if (!performance.length) return [];

  const base = Number.parseFloat(performance[0].equityMinor);
  if (!Number.isFinite(base) || base === 0) {
    return performance.map((point) => ({ date: point.date, value: 100 }));
  }

  return performance.map((point) => ({
    date: point.date,
    value: (Number.parseFloat(point.equityMinor) / base) * 100,
  }));
};

export const buildBenchmarkSeries = (
  performance: StrategyPerformance[],
  candles: Candle[],
): IndexedPoint[] => {
  if (!performance.length) return [];

  const closesByDate = new Map<string, number>();
  candles.forEach((candle) => {
    closesByDate.set(toDateKey(candle.ts), candle.close);
  });

  const baseClose = performance
    .map((point) => closesByDate.get(toDateKey(point.date)))
    .find((close): close is number => typeof close === "number" && Number.isFinite(close) && close > 0);

  if (!baseClose) {
    return performance.map((point) => ({ date: point.date, value: 100 }));
  }

  let lastClose = baseClose;

  return performance.map((point) => {
    const dateKey = toDateKey(point.date);
    const close = closesByDate.get(dateKey) ?? lastClose;

    if (Number.isFinite(close) && close > 0) {
      lastClose = close;
    }

    return {
      date: point.date,
      value: (lastClose / baseClose) * 100,
    };
  });
};
