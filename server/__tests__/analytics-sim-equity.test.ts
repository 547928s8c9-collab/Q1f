import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Balance, Vault, Position, Strategy, PortfolioSeries, StrategyPerformance } from "@shared/schema";
import { registerAnalyticsRoutes } from "../routes/analytics";

const storageMock = vi.hoisted(() => ({
  getBalances: vi.fn<[], Promise<Balance[]>>(),
  getVaults: vi.fn<[], Promise<Vault[]>>(),
  getPositions: vi.fn<[], Promise<Position[]>>(),
  getPortfolioSeries: vi.fn<[], Promise<PortfolioSeries[]>>(),
  getStrategies: vi.fn<[], Promise<Strategy[]>>(),
  getStrategyPerformance: vi.fn<[string, number?], Promise<StrategyPerformance[]>>(),
}));

vi.mock("../storage", () => ({
  storage: storageMock,
}));

describe("analytics overview (simulated equity)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("includes simulated equity snapshots in totals and series", async () => {
    storageMock.getBalances.mockResolvedValue([
      {
        id: "bal-1",
        userId: "user-1",
        asset: "USDT",
        available: "500000000",
        locked: "0",
        updatedAt: new Date(),
      },
    ]);
    storageMock.getVaults.mockResolvedValue([]);
    storageMock.getPositions.mockResolvedValue([
      {
        id: "pos-1",
        userId: "user-1",
        strategyId: "strat-1",
        principal: "0",
        currentValue: "0",
        principalMinor: "1000000000",
        investedCurrentMinor: "1000000000",
        accruedProfitPayableMinor: "0",
        lastAccrualDate: null,
        paused: false,
        ddLimitPct: 0,
        autoPauseEnabled: false,
        pausedAt: null,
        pausedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    storageMock.getPortfolioSeries.mockResolvedValue([]);
    storageMock.getStrategies.mockResolvedValue([
      {
        id: "strat-1",
        name: "Sim Strategy",
        description: null,
        riskTier: "CORE",
        baseAsset: "USDT",
        pairsJson: null,
        expectedMonthlyRangeBpsMin: null,
        expectedMonthlyRangeBpsMax: null,
        feesJson: null,
        termsJson: null,
        minInvestment: "100000000",
        worstMonth: null,
        maxDrawdown: null,
        isActive: true,
        createdAt: new Date(),
      },
    ]);
    storageMock.getStrategyPerformance.mockResolvedValue([
      {
        id: "perf-1",
        strategyId: "strat-1",
        day: 1,
        date: "2024-01-01",
        equityMinor: "1000000000",
        benchmarkBtcMinor: null,
        benchmarkEthMinor: null,
      },
      {
        id: "perf-2",
        strategyId: "strat-1",
        day: 2,
        date: "2024-01-02",
        equityMinor: "1100000000",
        benchmarkBtcMinor: null,
        benchmarkEthMinor: null,
      },
    ]);

    const app = express();
    registerAnalyticsRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const res = await request(app).get("/api/analytics/overview");

    expect(res.status).toBe(200);
    expect(res.body.totalEquityMinor).toBe("1600000000");
    expect(res.body.equitySeries).toEqual([
      { ts: "2024-01-01", equityMinor: "1500000000" },
      { ts: "2024-01-02", equityMinor: "1600000000" },
    ]);
    expect(res.body.strategies[0].currentMinor).toBe("1100000000");
  });
});
