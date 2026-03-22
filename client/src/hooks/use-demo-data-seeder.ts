import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { demoSeed } from "@/lib/demo-seed";
import type { BootstrapResponse } from "@shared/schema";

function toMinor(usdt: number): string {
  return Math.round(usdt * 1_000_000).toString();
}

function buildPortfolioSeries(): Array<{ date: string; value: string }> {
  const segments = [
    { startDate: "2025-10-15", endDate: "2025-10-31", startVal: 500.00,  endVal: 544.20 },
    { startDate: "2025-11-01", endDate: "2025-11-30", startVal: 544.20,  endVal: 512.70 },
    { startDate: "2025-12-01", endDate: "2025-12-31", startVal: 512.70,  endVal: 611.10 },
    { startDate: "2026-01-01", endDate: "2026-01-31", startVal: 611.10,  endVal: 687.20 },
    { startDate: "2026-02-01", endDate: "2026-02-28", startVal: 687.20,  endVal: 799.50 },
    { startDate: "2026-03-01", endDate: "2026-03-22", startVal: 799.50,  endVal: 847.00 },
  ];
  const points: Array<{ date: string; value: string }> = [];
  for (const seg of segments) {
    const start = new Date(seg.startDate);
    const end   = new Date(seg.endDate);
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const t   = totalDays === 0 ? 1 : i / totalDays;
      const val = seg.startVal + t * (seg.endVal - seg.startVal);
      points.push({
        date:  d.toISOString().split("T")[0],
        value: Math.round(val * 1_000_000).toString(),
      });
    }
  }
  return points;
}

function buildDemoAnalyticsOverview(days: number) {
  const series  = buildPortfolioSeries();
  const sliced  = series.slice(-days);
  const march   = demoSeed.monthlyHistory[5];
  return {
    updatedAt:        new Date().toISOString(),
    totalEquityMinor: toMinor(demoSeed.portfolio.currentBalance),
    metrics: {
      pnl30dMinor:       toMinor(march.pnl),
      roi30dPct:         march.pnlPct,
      maxDrawdown30dPct: Math.abs(demoSeed.monthlyHistory[1].pnlPct),
      positionsCount:    1,
      activePositions:   1,
    },
    equitySeries: sliced.map((d) => ({
      ts:          d.date + "T12:00:00.000Z",
      equityMinor: d.value,
    })),
    strategies: [{
      strategyId:         "demo-strategy-1",
      name:               "ZEON Alpha",
      riskTier:           "MEDIUM",
      allocatedMinor:     toMinor(demoSeed.portfolio.currentBalance),
      currentMinor:       toMinor(demoSeed.portfolio.currentBalance),
      pnlMinor:           toMinor(demoSeed.portfolio.totalProfit),
      roiPct:             parseFloat(
        ((demoSeed.portfolio.totalProfit / demoSeed.user.initialDeposit) * 100).toFixed(1)
      ),
      accruedProfitMinor: toMinor(march.pnl),
      status:             "INVESTED_ACTIVE",
    }],
  };
}

function buildDemoOperations() {
  const typeMap: Record<string, string> = {
    daily_pnl:  "DAILY_PAYOUT",
    withdrawal: "WITHDRAW_USDT",
    settlement: "DAILY_PAYOUT",
    deposit:    "DEPOSIT_USDT",
  };
  const operations = demoSeed.activity.map((item, i) => ({
    id:           `demo-op-${i}`,
    userId:       "demo-user",
    type:         typeMap[item.type] ?? item.type.toUpperCase(),
    status:       "completed",
    asset:        "USDT",
    amount:       toMinor(Math.abs(item.amount)),
    fee:          "0",
    txHash:       null,
    providerRef:  null,
    strategyId:   ["daily_pnl","settlement"].includes(item.type) ? "demo-strategy-1" : null,
    strategyName: ["daily_pnl","settlement"].includes(item.type) ? "ZEON Alpha" : null,
    fromVault:    null,
    toVault:      null,
    metadata:     null,
    reason:       null,
    createdAt:    item.date + "T12:00:00.000Z",
    updatedAt:    item.date + "T12:00:00.000Z",
  }));
  return { operations, nextCursor: undefined };
}

const MONTH_KEYS: Record<string, { year: number; month: number }> = {
  "Октябрь 2025": { year: 2025, month: 10 },
  "Ноябрь 2025":  { year: 2025, month: 11 },
  "Декабрь 2025": { year: 2025, month: 12 },
  "Январь 2026":  { year: 2026, month:  1 },
  "Февраль 2026": { year: 2026, month:  2 },
  "Март 2026":    { year: 2026, month:  3 },
};

function buildDemoStatements() {
  return demoSeed.monthlyHistory.map((entry, idx) => {
    const ym = MONTH_KEYS[entry.month]!;
    const monthWithdrawals = demoSeed.withdrawals.filter((w) => {
      const d = new Date(w.date);
      return d.getFullYear() === ym.year && d.getMonth() + 1 === ym.month;
    });
    const totalWithdrawn = monthWithdrawals.reduce((s, w) => s + w.amount, 0);
    const isFirst        = idx === 0;
    const pnlIn          = entry.pnl > 0 ? entry.pnl : 0;
    const pnlOut         = entry.pnl < 0 ? -entry.pnl : 0;
    const opCount        = (isFirst ? 2 : 1) + monthWithdrawals.length;
    return {
      year: ym.year, month: ym.month,
      data: {
        year: ym.year, month: ym.month,
        period:             entry.month,
        operationCount:     opCount,
        completedCount:     opCount,
        totalIn:            isFirst ? toMinor(demoSeed.user.initialDeposit + pnlIn) : toMinor(pnlIn),
        totalOut:           toMinor(pnlOut + totalWithdrawn),
        totalFees:          "0",
        managementFeeMinor: "0",
        net:                isFirst
          ? toMinor(demoSeed.user.initialDeposit + entry.pnl - totalWithdrawn)
          : toMinor(entry.pnl - totalWithdrawn),
      },
    };
  });
}

export function useDemoDataSeeder() {
  const { user }   = useAuth();
  const isDemo     = user?.email === "demo@example.com";
  const seededRef  = useRef(false);

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
    enabled:  isDemo,
  });

  useEffect(() => {
    if (!isDemo || !bootstrap || seededRef.current) return;
    seededRef.current = true;

    queryClient.setQueryData<BootstrapResponse>(["/api/bootstrap"], {
      ...bootstrap,
      portfolioSeries: buildPortfolioSeries(),
      balances: {
        ...bootstrap.balances,
        USDT: { available: toMinor(demoSeed.portfolio.currentBalance), locked: "0" },
      },
      invested: {
        current:   toMinor(demoSeed.portfolio.currentBalance),
        principal: toMinor(demoSeed.user.initialDeposit),
      },
    });

    for (const days of [7, 30, 90, 365, 9999]) {
      queryClient.setQueryData(
        ["/api/analytics/overview", { days }],
        buildDemoAnalyticsOverview(days),
      );
    }

    const ops = buildDemoOperations();
    queryClient.setQueryData(["/api/operations", { filter: undefined, q: undefined }], ops);
    queryClient.setQueryData(["/api/operations", {}], ops);

    for (const { year, month, data } of buildDemoStatements()) {
      queryClient.setQueryData(["/api/statements/summary", { year, month }], data);
    }
  }, [isDemo, bootstrap]);
}
