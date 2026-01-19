import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTelegramRoutes } from "../routes/telegram";
import { signTelegramJwt } from "../telegram/jwt";
import { storage } from "../storage";

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
  },
}));

const mockedStorage = storage as unknown as {
  getUserById: ReturnType<typeof vi.fn>;
  getBalances: ReturnType<typeof vi.fn>;
  getPositions: ReturnType<typeof vi.fn>;
  getUnreadNotificationCount: ReturnType<typeof vi.fn>;
  getStrategies: ReturnType<typeof vi.fn>;
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
