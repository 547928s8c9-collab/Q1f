import { describe, expect, it } from "vitest";
import type { InvestTrade } from "@shared/schema";
import type { TradeStats } from "./types";
import { calculateInvestMetrics } from "./investSimulation";

describe("calculateInvestMetrics", () => {
  it("computes win rate, averages, and profit factor", () => {
    const trades: InvestTrade[] = [
      {
        id: "t1",
        entryTs: 0,
        exitTs: 1,
        entryPrice: 100,
        exitPrice: 110,
        qty: 1,
        netPnl: 150,
        netPnlPct: 1.5,
        holdBars: 4,
        reason: "breakout",
      },
      {
        id: "t2",
        entryTs: 2,
        exitTs: 3,
        entryPrice: 100,
        exitPrice: 95,
        qty: 1,
        netPnl: -50,
        netPnlPct: -0.5,
        holdBars: 2,
        reason: "stop",
      },
    ];

    const stats: TradeStats = {
      totalTrades: 2,
      wins: 1,
      losses: 1,
      grossPnl: 180,
      fees: 30,
      netPnl: 100,
    };

    const metrics = calculateInvestMetrics({ trades, stats, startingEquity: 10_000 });

    expect(metrics.totalTrades).toBe(2);
    expect(metrics.winRatePct).toBeCloseTo(50, 2);
    expect(metrics.avgHoldBars).toBeCloseTo(3, 2);
    expect(metrics.netPnlPct).toBeCloseTo(1, 2);
    expect(metrics.profitFactor).toBeCloseTo(3, 2);
    expect(metrics.avgTradePnl).toBeCloseTo(50, 2);
  });
});
