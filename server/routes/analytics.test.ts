import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { registerAnalyticsRoutes } from "./analytics";

vi.mock("../storage", () => ({
  storage: {
    getBalances: vi.fn().mockResolvedValue([]),
    getVaults: vi.fn().mockResolvedValue([]),
    getPositions: vi.fn().mockResolvedValue([]),
    getPortfolioSeries: vi.fn().mockResolvedValue([]),
    getStrategies: vi.fn().mockResolvedValue([]),
    getBenchmarkSeries: vi.fn().mockImplementation(async (asset: string, timeframeDays: number) => ([
      { asset, timeframeDays, date: "2024-01-01", value: "100.0000" },
    ])),
  },
}));

describe("GET /api/analytics/overview", () => {
  it("includes benchmark series in overview response", async () => {
    const app = express();
    app.use(express.json());

    registerAnalyticsRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const res = await request(app).get("/api/analytics/overview");

    expect(res.status).toBe(200);
    expect(res.body.benchmarkSeries["30"].BTC[0]).toEqual({
      date: "2024-01-01",
      value: "100.0000",
    });
  });
});
