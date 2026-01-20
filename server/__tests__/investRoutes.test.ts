import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerInvestRoutes } from "../routes/invest";
import { storage } from "../storage";
import { loadCandles } from "../marketData/loadCandles";
import { simulateInvestStrategy } from "../strategies/investSimulation";

vi.mock("../storage", () => ({
  storage: {
    getStrategy: vi.fn(),
    getStrategyProfiles: vi.fn(),
    getSimTrades: vi.fn(),
  },
}));

vi.mock("../marketData/loadCandles", () => ({
  loadCandles: vi.fn(),
}));

vi.mock("../strategies/investSimulation", () => ({
  simulateInvestStrategy: vi.fn(),
}));

const mockedStorage = storage as unknown as {
  getStrategy: ReturnType<typeof vi.fn>;
  getStrategyProfiles: ReturnType<typeof vi.fn>;
  getSimTrades: ReturnType<typeof vi.fn>;
};

const mockedLoadCandles = loadCandles as unknown as ReturnType<typeof vi.fn>;
const mockedSimulateInvestStrategy = simulateInvestStrategy as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/invest/strategies/:id/candles", () => {
  beforeEach(() => {
    mockedStorage.getStrategy.mockResolvedValue({ id: "strategy-1", name: "BTC Squeeze Breakout" });
    mockedStorage.getStrategyProfiles.mockResolvedValue([
      {
        id: "profile-1",
        slug: "btc_squeeze_breakout",
        displayName: "BTC Squeeze Breakout",
        symbol: "BTCUSDT",
        timeframe: "15m",
        description: "",
        riskLevel: "HIGH",
        tags: [],
        defaultConfig: {},
        configSchema: {},
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockedLoadCandles.mockResolvedValue({
      candles: [{ ts: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      gaps: [],
      source: "cache",
    });

    mockedStorage.getSimTrades.mockResolvedValue([]);
    mockedSimulateInvestStrategy.mockReturnValue({ trades: [], metrics: { totalTrades: 0, winRatePct: 0, netPnl: 0, netPnlPct: 0, grossPnl: 0, fees: 0, avgHoldBars: 0, profitFactor: 0, avgTradePnl: 0 } });
  });

  it("returns candles with metadata", async () => {
    const app = express();
    registerInvestRoutes({ app, isAuthenticated: (_req, _res, next) => next(), devOnly: (_req, _res, next) => next() });

    const res = await request(app).get("/api/invest/strategies/strategy-1/candles?timeframe=15m&period=7");

    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe("BTCUSDT");
    expect(res.body.timeframe).toBe("15m");
    expect(res.body.periodDays).toBe(7);
    expect(res.body.candles).toHaveLength(1);
  });

  it("clamps period days for shorter timeframes", async () => {
    const app = express();
    registerInvestRoutes({ app, isAuthenticated: (_req, _res, next) => next(), devOnly: (_req, _res, next) => next() });

    const res = await request(app).get("/api/invest/strategies/strategy-1/candles?timeframe=1m&period=30");

    expect(res.status).toBe(200);
    expect(res.body.timeframe).toBe("1m");
    expect(res.body.periodDays).toBe(7);
  });

  it("returns sim trades for insights when available", async () => {
    mockedStorage.getSimTrades.mockResolvedValue([
      {
        id: "trade-1",
        strategyId: "strategy-1",
        status: "CLOSED",
        entryTs: 1000,
        exitTs: 2000,
        entryPrice: "100",
        exitPrice: "110",
        qty: "1",
        grossPnlMinor: "0",
        feesMinor: "0",
        netPnlMinor: "1000000",
        holdBars: 1,
        reason: "signal",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const app = express();
    registerInvestRoutes({ app, isAuthenticated: (_req, _res, next) => next(), devOnly: (_req, _res, next) => next() });

    const res = await request(app).get("/api/invest/strategies/strategy-1/insights?timeframe=15m&period=7");

    expect(res.status).toBe(200);
    expect(res.body.trades).toHaveLength(1);
    expect(res.body.trades[0].id).toBe("trade-1");
    expect(mockedSimulateInvestStrategy).not.toHaveBeenCalled();
  });
});
