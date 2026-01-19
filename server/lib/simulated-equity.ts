import type { Position, StrategyPerformance } from "@shared/schema";

export interface SimulatedEquityPoint {
  date: string;
  equityMinor: string;
}

export interface SimulatedEquityResult {
  totalCurrentMinor: bigint;
  totalPrincipalMinor: bigint;
  series: SimulatedEquityPoint[];
  perStrategyCurrent: Map<string, bigint>;
}

const parseMinor = (value?: string | null): bigint => {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
};

export function buildSimulatedEquity(
  positions: Position[],
  performanceByStrategy: Map<string, StrategyPerformance[]>
): SimulatedEquityResult {
  const seriesMap = new Map<string, bigint>();
  const perStrategyCurrent = new Map<string, bigint>();

  let totalCurrentMinor = 0n;
  let totalPrincipalMinor = 0n;

  for (const position of positions) {
    const principalMinor = parseMinor(position.principalMinor || position.principal);
    const fallbackCurrentMinor = parseMinor(
      position.investedCurrentMinor || position.currentValue || position.principalMinor || position.principal
    );
    totalPrincipalMinor += principalMinor;

    const performance = performanceByStrategy.get(position.strategyId) ?? [];
    if (principalMinor === 0n || performance.length === 0) {
      totalCurrentMinor += fallbackCurrentMinor;
      const existingCurrent = perStrategyCurrent.get(position.strategyId) ?? 0n;
      perStrategyCurrent.set(position.strategyId, existingCurrent + fallbackCurrentMinor);
      continue;
    }

    const baseEquity = parseMinor(performance[0]?.equityMinor);
    if (baseEquity <= 0n) {
      totalCurrentMinor += fallbackCurrentMinor;
      const existingCurrent = perStrategyCurrent.get(position.strategyId) ?? 0n;
      perStrategyCurrent.set(position.strategyId, existingCurrent + fallbackCurrentMinor);
      continue;
    }

    for (const point of performance) {
      if (!point.date) continue;
      const equityMinor = parseMinor(point.equityMinor);
      const scaledEquity = (principalMinor * equityMinor) / baseEquity;
      const existing = seriesMap.get(point.date) ?? 0n;
      seriesMap.set(point.date, existing + scaledEquity);
    }

    const latest = performance[performance.length - 1];
    const latestEquity = parseMinor(latest?.equityMinor);
    const currentMinor = (principalMinor * latestEquity) / baseEquity;
    totalCurrentMinor += currentMinor;
    const existingCurrent = perStrategyCurrent.get(position.strategyId) ?? 0n;
    perStrategyCurrent.set(position.strategyId, existingCurrent + currentMinor);
  }

  const series = Array.from(seriesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, equityMinor]) => ({
      date,
      equityMinor: equityMinor.toString(),
    }));

  return {
    totalCurrentMinor,
    totalPrincipalMinor,
    series,
    perStrategyCurrent,
  };
}
