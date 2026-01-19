import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerTelegramRoutes } from "../routes/telegram";
import { storage } from "../storage";
import * as botApi from "../telegram/botApi";

vi.mock("../storage", () => ({
  storage: {
    getTelegramAccountByTelegramUserId: vi.fn(),
    getBalances: vi.fn(),
    getPositions: vi.fn(),
    getUnreadNotificationCount: vi.fn(),
    createTelegramActionToken: vi.fn(),
    consumeTelegramActionToken: vi.fn(),
  },
}));

vi.mock("../telegram/botApi", () => ({
  botSendMessage: vi.fn(),
  botEditMessageText: vi.fn(),
  botAnswerCallbackQuery: vi.fn(),
}));

const mockedStorage = storage as unknown as {
  getTelegramAccountByTelegramUserId: ReturnType<typeof vi.fn>;
  getBalances: ReturnType<typeof vi.fn>;
  getPositions: ReturnType<typeof vi.fn>;
  getUnreadNotificationCount: ReturnType<typeof vi.fn>;
  createTelegramActionToken: ReturnType<typeof vi.fn>;
  consumeTelegramActionToken: ReturnType<typeof vi.fn>;
};

describe("POST /api/telegram/bot/webhook", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.TELEGRAM_PUBLIC_WEBAPP_URL = "https://example.com/tg";

    mockedStorage.getTelegramAccountByTelegramUserId.mockResolvedValue({ userId: "user-1" });
    mockedStorage.getBalances.mockResolvedValue([{ asset: "USDT", available: "1000000" }]);
    mockedStorage.getPositions.mockResolvedValue([{ id: "pos-1" }, { id: "pos-2" }]);
    mockedStorage.getUnreadNotificationCount.mockResolvedValue(3);
    mockedStorage.createTelegramActionToken.mockResolvedValue("next-token");
    mockedStorage.consumeTelegramActionToken.mockResolvedValue({
      status: "ok",
      action: "REFRESH",
      payload: null,
      telegramUserId: "123",
      userId: "user-1",
    });
  });

  it("answers callback and edits message on refresh", async () => {
    const app = express();
    app.use(express.json());
    registerTelegramRoutes({
      app,
      isAuthenticated: (_req, _res, next) => next(),
      devOnly: (_req, _res, next) => next(),
      getUserId: () => "user-1",
    });

    const res = await request(app)
      .post("/api/telegram/bot/webhook")
      .send({
        callback_query: {
          id: "cb-1",
          from: { id: 123 },
          data: "a:token-1",
          message: {
            message_id: 55,
            chat: { id: 123, type: "private" },
          },
        },
      });

    expect(res.status).toBe(200);
    expect(botApi.botAnswerCallbackQuery).toHaveBeenCalled();
    expect(botApi.botEditMessageText).toHaveBeenCalled();
    const editCall = (botApi.botEditMessageText as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(editCall[0]).toBe("123");
    expect(editCall[1]).toBe(55);
    expect(editCall[2]).toContain("Сводка");
  });
});
