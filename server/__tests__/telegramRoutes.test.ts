import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTelegramRoutes } from "../routes/telegram";
import {
  createTelegramLinkToken,
  confirmTelegramLink,
  getTelegramAuthUserId,
  validateTelegramInitData,
} from "../services/telegram";

vi.mock("../services/telegram", () => ({
  createTelegramLinkToken: vi.fn(),
  confirmTelegramLink: vi.fn(),
  getTelegramAuthUserId: vi.fn(),
  validateTelegramInitData: vi.fn(),
}));

const mockedCreateToken = createTelegramLinkToken as unknown as ReturnType<typeof vi.fn>;
const mockedConfirmLink = confirmTelegramLink as unknown as ReturnType<typeof vi.fn>;
const mockedGetAuthUserId = getTelegramAuthUserId as unknown as ReturnType<typeof vi.fn>;
const mockedValidateInit = validateTelegramInitData as unknown as ReturnType<typeof vi.fn>;

const setupApp = () => {
  const app = express();
  app.use(express.json());
  registerTelegramRoutes({
    app,
    isAuthenticated: (_req, _res, next) => next(),
    devOnly: (_req, _res, next) => next(),
    getUserId: () => "user-1",
  });
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Telegram routes", () => {
  it("creates a link token", async () => {
    mockedCreateToken.mockResolvedValue({
      code: "12345678",
      expiresAt: new Date("2024-01-01T00:00:00.000Z"),
    });

    const res = await request(setupApp()).post("/api/telegram/link-token");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.code).toBe("12345678");
  });

  it("confirms a link token", async () => {
    mockedValidateInit.mockReturnValue({ ok: true, data: { user: { id: 123 } } });
    mockedConfirmLink.mockResolvedValue({ ok: true });

    const res = await request(setupApp())
      .post("/api/telegram/link/confirm")
      .send({ initData: "hash=stub", code: "12345678" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns not linked for auth when missing", async () => {
    mockedValidateInit.mockReturnValue({ ok: true, data: { user: { id: 555 } } });
    mockedGetAuthUserId.mockResolvedValue(null);

    const res = await request(setupApp())
      .post("/api/telegram/auth")
      .send({ initData: "hash=stub" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TELEGAM_NOT_LINKED");
  });
});
