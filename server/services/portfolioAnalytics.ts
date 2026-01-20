import type { Balance, Position, Strategy, Vault } from "@shared/schema";

interface PortfolioSeriesPoint {
  date: string;
  value: string;
}

interface AnalyticsInput {
  balances: Balance[];
  vaults: Vault[];
  positions: Position[];
  portfolioSeries: PortfolioSeriesPoint[];
  strategies: Strategy[];
}

export function computeAnalyticsOverview({
  balances,
  vaults,
  positions,
  portfolioSeries,
  strategies,
}: AnalyticsInput) {
  const strategyMap = new Map(strategies.map((s) => [s.id, s]));

  let totalEquityMinor = BigInt(0);

  for (const b of balances) {
    if (b.asset === "USDT") {
      totalEquityMinor += BigInt(b.available || "0") + BigInt(b.locked || "0");
    }
  }

  for (const v of vaults) {
    if (v.asset === "USDT") {
      totalEquityMinor += BigInt(v.balance || "0");
    }
  }

  for (const p of positions) {
    totalEquityMinor += BigInt(p.investedCurrentMinor || "0");
  }

  let pnl30dMinor = BigInt(0);
  let roi30dPct = 0;
  let maxDrawdown30dPct = 0;

  const sortedSeries = [...portfolioSeries].sort((a, b) => a.date.localeCompare(b.date));

  if (sortedSeries.length >= 2) {
    const firstValue = BigInt(sortedSeries[0].value || "0");
    const lastValue = BigInt(sortedSeries[sortedSeries.length - 1].value || "0");

    pnl30dMinor = lastValue - firstValue;

    if (firstValue > 0n) {
      roi30dPct = (Number(lastValue - firstValue) / Number(firstValue)) * 100;
    }

    let peak = BigInt(0);
    let maxDrawdown = 0;

    for (const point of sortedSeries) {
      const value = BigInt(point.value || "0");
      if (value > peak) {
        peak = value;
      }
      if (peak > 0n) {
        const drawdown = Number(peak - value) / Number(peak);
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    maxDrawdown30dPct = maxDrawdown * 100;
  }

  const perStrategy = positions.map((pos) => {
    const strategy = strategyMap.get(pos.strategyId);
    const principal = BigInt(pos.principalMinor || "0");
    const current = BigInt(pos.investedCurrentMinor || "0");
    const pnlMinor = current - principal;
    const roiPct = principal > 0n ? (Number(pnlMinor) / Number(principal)) * 100 : 0;

    return {
      strategyId: pos.strategyId,
      name: strategy?.name || "Unknown Strategy",
      riskTier: strategy?.riskTier || "CORE",
      allocatedMinor: pos.principalMinor || "0",
      currentMinor: pos.investedCurrentMinor || "0",
      pnlMinor: pnlMinor.toString(),
      roiPct: Math.round(roiPct * 100) / 100,
      accruedProfitMinor: pos.accruedProfitPayableMinor || "0",
      status: pos.paused ? "paused" : "active",
    };
  });

  const equitySeries = sortedSeries.map((s) => ({
    ts: s.date,
    equityMinor: s.value,
  }));

  return {
    totalEquityMinor: totalEquityMinor.toString(),
    metrics: {
      pnl30dMinor: pnl30dMinor.toString(),
      roi30dPct: Math.round(roi30dPct * 100) / 100,
      maxDrawdown30dPct: Math.round(maxDrawdown30dPct * 100) / 100,
      positionsCount: positions.length,
      activePositions: positions.filter((p) => !p.paused).length,
    },
    equitySeries,
    strategies: perStrategy,
  };
}
