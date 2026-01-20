import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerInvestRoutes } from "../routes/invest";
import { storage } from "../storage";
import { getMarketCandles } from "../app/marketDataService";

vi.mock("../storage", () => ({
  storage: {
    getStrategy: vi.fn(),
    getStrategyProfiles: vi.fn(),
  },
}));

vi.mock("../app/marketDataService", () => ({
  getMarketCandles: vi.fn(),
}));

const mockedStorage = storage as unknown as {
  getStrategy: ReturnType<typeof vi.fn>;
  getStrategyProfiles: ReturnType<typeof vi.fn>;
};

const mockedGetMarketCandles = getMarketCandles as unknown as ReturnType<typeof vi.fn>;

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

    mockedGetMarketCandles.mockResolvedValue({
      candles: [{ ts: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      gaps: [],
      source: "cache",
    });
  });

  it("returns candles with metadata", async () => {
    const app = express();
    registerInvestRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const res = await request(app).get("/api/invest/strategies/strategy-1/candles?timeframe=15m&periodDays=7");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.symbol).toBe("BTCUSDT");
    expect(res.body.data.timeframe).toBe("15m");
    expect(res.body.data.periodDays).toBe(7);
    expect(res.body.data.candles).toHaveLength(1);
  });
});
