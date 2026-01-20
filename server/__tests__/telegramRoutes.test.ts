import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTelegramRoutes } from "../routes/telegram";
import { signTelegramJwt } from "../telegram/jwt";
import { storage } from "../storage";

const queryResults: any[] = [];

const createQueryMock = () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    then: (resolve: (value: any) => any) => Promise.resolve(queryResults.shift()).then(resolve),
  };
  return chain;
};

vi.mock("../db", () => ({
  db: {
    select: () => createQueryMock(),
  },
}));

vi.mock("../app/engineScheduler", () => ({
  engineScheduler: {
    getHealth: () => ({
      activeLoops: 1,
      loops: [{ lastTickTs: 123, lastError: null }],
    }),
  },
}));

vi.mock("../storage", () => ({
  storage: {
    getUserById: vi.fn(),
    getBalances: vi.fn(),
    getPositions: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
    getStrategies: vi.fn(),
    getTelegramAccountByTelegramUserId: vi.fn(),
    getUserByTelegramLinkCode: vi.fn(),
    upsertTelegramAccount: vi.fn(),
    getPositions: vi.fn(),
    getStrategyProfiles: vi.fn(),
    getPosition: vi.fn(),
    getSimEquitySnapshots: vi.fn(),
    getSimTrades: vi.fn(),
    getSimTradeEvents: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
    getStrategy: vi.fn(),
  },
}));

const mockedStorage = storage as unknown as {
  getUserById: ReturnType<typeof vi.fn>;
  getBalances: ReturnType<typeof vi.fn>;
  getPositions: ReturnType<typeof vi.fn>;
  getUnreadNotificationCount: ReturnType<typeof vi.fn>;
  getStrategies: ReturnType<typeof vi.fn>;
  getPositions: ReturnType<typeof vi.fn>;
  getStrategyProfiles: ReturnType<typeof vi.fn>;
  getPosition: ReturnType<typeof vi.fn>;
  getSimEquitySnapshots: ReturnType<typeof vi.fn>;
  getSimTrades: ReturnType<typeof vi.fn>;
  getSimTradeEvents: ReturnType<typeof vi.fn>;
  getStrategy: ReturnType<typeof vi.fn>;
};

describe("GET /api/tg/bootstrap", () => {
  beforeEach(() => {
    process.env.TELEGRAM_JWT_SECRET = "test-secret";

    mockedStorage.getUserById.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockedStorage.getBalances.mockResolvedValue([
      { asset: "USDT", available: "1000000", locked: "0" },
    ]);
    mockedStorage.getPositions.mockResolvedValue([
      {
        id: "pos-1",
        strategyId: "strat-1",
        principalMinor: "1000000",
        investedCurrentMinor: "1100000",
      },
    ]);
    mockedStorage.getUnreadNotificationCount.mockResolvedValue(2);
    mockedStorage.getStrategies.mockResolvedValue([
      { id: "strat-1", name: "Core Yield" },
    ]);
    mockedStorage.getPositions.mockResolvedValue([]);
    mockedStorage.getStrategyProfiles.mockResolvedValue([]);
  });

  it("requires authorization", async () => {
    const app = express();
    registerTelegramRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const res = await request(app).get("/api/tg/bootstrap");

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns bootstrap data", async () => {
    const app = express();
    registerTelegramRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const token = signTelegramJwt({ userId: "user-1", telegramUserId: "tg-1" });
    const res = await request(app)
      .get("/api/tg/bootstrap")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.user.email).toBe("user@example.com");
    expect(res.body.data.positions[0].strategyName).toBe("Core Yield");
  });
});

describe("GET /api/tg/engine/status", () => {
  it("returns engine health for telegram session", async () => {
    const app = express();
    registerTelegramRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const token = signTelegramJwt({ userId: "user-1", telegramUserId: "tg-1" });
    const res = await request(app)
      .get("/api/tg/engine/status")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.state).toBe("running");
  });
});

describe("GET /api/tg/strategies", () => {
  beforeEach(() => {
    mockedStorage.getStrategies.mockResolvedValue([
      { id: "strat-1", name: "Core Yield", riskTier: "CORE" },
    ]);
    mockedStorage.getPositions.mockResolvedValue([
      { strategyId: "strat-1", principalMinor: "1000", investedCurrentMinor: "1200" },
    ]);
    mockedStorage.getStrategyProfiles.mockResolvedValue([
      { displayName: "Core Yield", symbol: "BTCUSDT", timeframe: "1h" },
    ]);

    queryResults.length = 0;
    queryResults.push(
      [{ strategyId: "strat-1", symbol: "BTCUSDT", timeframe: "1h" }],
      [{ strategyId: "strat-1", state: "ACTIVE" }],
      [{ strategyId: "strat-1", ts: 1, equityMinor: "1000", allocatedMinor: "1000" }],
      [{ strategyId: "strat-1", count: 3 }],
    );
  });

  it("returns compact strategy list", async () => {
    const app = express();
    registerTelegramRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const token = signTelegramJwt({ userId: "user-1", telegramUserId: "tg-1" });
    const res = await request(app)
      .get("/api/tg/strategies")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.strategies[0].symbol).toBe("BTCUSDT");
  });
});
