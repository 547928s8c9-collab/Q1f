import { describe, expect, it, vi, beforeEach } from "vitest";
import { processOutboxBatch } from "../workers/outboxWorker";
import { sendTelegramMessage } from "../telegram/sendMessage";
import { storage } from "../storage";

vi.mock("../telegram/sendMessage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../telegram/sendMessage")>();
  return {
    ...actual,
    sendTelegramMessage: vi.fn(),
  };
});

vi.mock("../storage", () => ({
  storage: {
    getPendingOutboxEvents: vi.fn(),
    markOutboxProcessed: vi.fn(),
    incrementOutboxAttempt: vi.fn(),
  },
}));

const mockedStorage = storage as unknown as {
  getPendingOutboxEvents: ReturnType<typeof vi.fn>;
  markOutboxProcessed: ReturnType<typeof vi.fn>;
  incrementOutboxAttempt: ReturnType<typeof vi.fn>;
};

const mockedSend = sendTelegramMessage as unknown as ReturnType<typeof vi.fn>;

describe("outboxWorker", () => {
  beforeEach(() => {
    mockedStorage.getPendingOutboxEvents.mockReset();
    mockedStorage.markOutboxProcessed.mockReset();
    mockedStorage.incrementOutboxAttempt.mockReset();
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
    mockedSend.mockResolvedValue(undefined);

    await processOutboxBatch();

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedStorage.markOutboxProcessed).toHaveBeenCalledWith("evt-1");
  });

  it("increments attempts on send failure", async () => {
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
    mockedSend.mockRejectedValue(new Error("fail"));

    await processOutboxBatch();

    expect(mockedStorage.incrementOutboxAttempt).toHaveBeenCalledWith("evt-2", "fail");
  });
});
