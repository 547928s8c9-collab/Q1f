import { describe, expect, it, vi, beforeEach } from "vitest";
import { processOutboxBatch } from "../workers/outboxWorker";
import { sendTelegramMessageWithKeyboard } from "../telegram/botApi";
import { storage } from "../storage";

vi.mock("../telegram/botApi", () => ({
  sendTelegramMessageWithKeyboard: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getPendingOutboxEvents: vi.fn(),
    markOutboxProcessed: vi.fn(),
    incrementOutboxAttempt: vi.fn(),
    createTelegramActionToken: vi.fn(),
  },
}));

const mockedStorage = storage as unknown as {
  getPendingOutboxEvents: ReturnType<typeof vi.fn>;
  markOutboxProcessed: ReturnType<typeof vi.fn>;
  incrementOutboxAttempt: ReturnType<typeof vi.fn>;
  createTelegramActionToken: ReturnType<typeof vi.fn>;
};

const mockedSend = sendTelegramMessageWithKeyboard as unknown as ReturnType<typeof vi.fn>;

describe("outboxWorker", () => {
  beforeEach(() => {
    process.env.TELEGRAM_PUBLIC_WEBAPP_URL = "https://example.com/tg";
    mockedStorage.getPendingOutboxEvents.mockReset();
    mockedStorage.markOutboxProcessed.mockReset();
    mockedStorage.incrementOutboxAttempt.mockReset();
    mockedStorage.createTelegramActionToken.mockReset();
    mockedSend.mockReset();
  });

  it("marks event processed after successful send", async () => {
    mockedStorage.getPendingOutboxEvents.mockResolvedValue([
      {
        id: "evt-1",
        eventType: "telegram.send",
        payloadJson: {
          userId: "user-1",
          telegramUserId: "tg-1",
          notificationType: "kyc",
          title: "KYC Approved",
          message: "Approved.",
        },
      },
    ]);
    mockedStorage.createTelegramActionToken.mockResolvedValue({
      token: "refresh-token-123",
      expiresAt: new Date(),
    });
    mockedSend.mockResolvedValue(undefined);

    await processOutboxBatch();

    expect(mockedStorage.createTelegramActionToken).toHaveBeenCalledWith({
      telegramUserId: "tg-1",
      userId: "user-1",
      action: "REFRESH",
      ttlSeconds: 600,
    });
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend).toHaveBeenCalledWith(
      "tg-1",
      expect.stringContaining("KYC Approved"),
      expect.objectContaining({
        disableWebPagePreview: true,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "📱 Open App", web_app: { url: "https://example.com/tg" } }],
            [{ text: "🔄 Refresh", callback_data: "a:refresh-token-123" }],
          ],
        },
      })
    );
    expect(mockedStorage.markOutboxProcessed).toHaveBeenCalledWith("evt-1");
  });

  it("includes reply_markup with Open App and Refresh buttons", async () => {
    mockedStorage.getPendingOutboxEvents.mockResolvedValue([
      {
        id: "evt-2",
        eventType: "telegram.send",
        payloadJson: {
          userId: "user-2",
          telegramUserId: "tg-2",
          notificationType: "security",
          title: "Strategy Auto-Paused",
          message: "Paused.",
        },
      },
    ]);
    mockedStorage.createTelegramActionToken.mockResolvedValue({
      token: "test-refresh-token",
      expiresAt: new Date(),
    });
    mockedSend.mockResolvedValue(undefined);

    await processOutboxBatch();

    const sendCall = mockedSend.mock.calls[0];
    expect(sendCall[2]).toHaveProperty("replyMarkup");
    expect(sendCall[2].replyMarkup.inline_keyboard).toHaveLength(2);
    expect(sendCall[2].replyMarkup.inline_keyboard[0][0]).toMatchObject({
      text: "📱 Open App",
      web_app: { url: "https://example.com/tg" },
    });
    expect(sendCall[2].replyMarkup.inline_keyboard[1][0]).toMatchObject({
      text: "🔄 Refresh",
      callback_data: "a:test-refresh-token",
    });
  });

  it("increments attempts on send failure", async () => {
    mockedStorage.getPendingOutboxEvents.mockResolvedValue([
      {
        id: "evt-3",
        eventType: "telegram.send",
        payloadJson: {
          userId: "user-3",
          telegramUserId: "tg-3",
          notificationType: "transaction",
          title: "Deposit",
          message: "Deposited.",
        },
      },
    ]);
    mockedStorage.createTelegramActionToken.mockResolvedValue({
      token: "token-123",
      expiresAt: new Date(),
    });
    mockedSend.mockRejectedValue(new Error("fail"));

    await processOutboxBatch();

    expect(mockedStorage.incrementOutboxAttempt).toHaveBeenCalledWith("evt-3", "fail");
  });
});
