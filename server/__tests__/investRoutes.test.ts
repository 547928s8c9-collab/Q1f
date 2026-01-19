import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerInvestRoutes } from "../routes/invest";

vi.mock("../storage", () => ({
  storage: {
    getStrategies: vi.fn(),
    getPositions: vi.fn(),
    getStrategy: vi.fn(),
    getStrategyPerformance: vi.fn(),
    getPosition: vi.fn(),
    getSecuritySettings: vi.fn(),
    getKycApplicant: vi.fn(),
    createRedemptionRequest: vi.fn(),
  },
}));

vi.mock("../marketData/loadCandles", () => ({
  loadCandles: vi.fn(),
}));

import { storage } from "../storage";

describe("invest routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    registerInvestRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });
    return app;
  }

  it("returns strategies and positions for invest strategies", async () => {
    (storage.getStrategies as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "strategy-1", name: "Alpha", minInvestment: "100" },
    ]);
    (storage.getPositions as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "position-1", strategyId: "strategy-1", userId: "user-1" },
    ]);

    const app = buildApp();
    const res = await request(app).get("/api/invest/strategies");

    expect(res.status).toBe(200);
    expect(res.body.strategies).toHaveLength(1);
    expect(res.body.positions).toHaveLength(1);
  });

  it("returns overview data for a strategy", async () => {
    (storage.getStrategy as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "strategy-1",
      name: "Alpha",
      minInvestment: "100",
    });
    (storage.getStrategyPerformance as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "perf-1", strategyId: "strategy-1", day: 1 },
    ]);
    (storage.getPosition as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "position-1",
      strategyId: "strategy-1",
      userId: "user-1",
    });

    const app = buildApp();
    const res = await request(app).get("/api/invest/strategies/strategy-1/overview?period=30");

    expect(res.status).toBe(200);
    expect(res.body.strategy.id).toBe("strategy-1");
    expect(res.body.performance).toHaveLength(1);
    expect(res.body.position.id).toBe("position-1");
    expect(res.body.periodDays).toBe(30);
  });

  it("validates required symbol for candles", async () => {
    (storage.getStrategy as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "strategy-1",
      name: "Alpha",
      minInvestment: "100",
    });

    const app = buildApp();
    const res = await request(app)
      .get("/api/invest/strategies/strategy-1/candles?timeframe=1h&period=30");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_SYMBOL");
  });

  it("creates redemption request on withdraw", async () => {
    (storage.getSecuritySettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      consentAccepted: true,
    });
    (storage.getKycApplicant as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "APPROVED",
    });
    (storage.getPosition as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "position-1",
      strategyId: "strategy-1",
      userId: "user-1",
      principalMinor: "1000",
      principal: "1000",
    });
    (storage.createRedemptionRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "redemption-1",
      strategyId: "strategy-1",
      amountMinor: "250",
      executeAt: new Date("2024-01-07T00:00:00.000Z"),
      status: "PENDING",
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/invest/strategies/strategy-1/withdraw")
      .send({ amountMinor: "250" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.redemption.id).toBe("redemption-1");
  });
});
