import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerInvestRoutes } from "../routes/invest";
import { storage } from "../storage";
import { loadCandles } from "../marketData/loadCandles";

vi.mock("../storage", () => ({
  storage: {
    getStrategy: vi.fn(),
    getStrategyProfiles: vi.fn(),
    getStrategies: vi.fn(),
  },
}));

vi.mock("../marketData/loadCandles", () => ({
  loadCandles: vi.fn(),
}));

const mockedStorage = storage as unknown as {
  getStrategy: ReturnType<typeof vi.fn>;
  getStrategyProfiles: ReturnType<typeof vi.fn>;
  getStrategies: ReturnType<typeof vi.fn>;
};

const mockedLoadCandles = loadCandles as unknown as ReturnType<typeof vi.fn>;

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
    mockedStorage.getStrategies.mockResolvedValue([{ id: "strategy-1", name: "BTC Squeeze Breakout" }]);

    mockedLoadCandles.mockResolvedValue({
      candles: [{ ts: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      gaps: [],
      source: "cache",
    });
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

  it("lists invest strategies", async () => {
    const app = express();
    registerInvestRoutes({ app, isAuthenticated: (_req, _res, next) => next(), devOnly: (_req, _res, next) => next() });

    const res = await request(app).get("/api/invest/strategies");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("strategy-1");
  });

  it("returns strategy overview", async () => {
    const app = express();
    registerInvestRoutes({ app, isAuthenticated: (_req, _res, next) => next(), devOnly: (_req, _res, next) => next() });

    const res = await request(app).get("/api/invest/strategies/strategy-1/overview");

    expect(res.status).toBe(200);
    expect(res.body.strategy.id).toBe("strategy-1");
    expect(res.body.profile.slug).toBe("btc_squeeze_breakout");
  });

  it("limits trades in insights responses", async () => {
    const app = express();
    registerInvestRoutes({ app, isAuthenticated: (_req, _res, next) => next(), devOnly: (_req, _res, next) => next() });

    mockedLoadCandles.mockResolvedValue({
      candles: [
        { ts: 1, open: 1, high: 1.1, low: 0.9, close: 1, volume: 1 },
        { ts: 2, open: 1, high: 1.1, low: 0.9, close: 1, volume: 1 },
      ],
      gaps: [],
      source: "cache",
    });

    const res = await request(app).get("/api/invest/strategies/strategy-1/insights?timeframe=15m&period=7&tradeLimit=1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("trades");
    expect(res.body).toHaveProperty("metrics");
  });
});
