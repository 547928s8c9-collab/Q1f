import { describe, expect, it } from "vitest";
import { storage } from "../storage";

process.env.NODE_ENV = "test";

describe("telegram action tokens", () => {
  it("creates and consumes tokens", async () => {
    const token = await storage.createTelegramActionToken({
      telegramUserId: "tg-1",
      userId: "user-1",
      action: "REFRESH",
      payload: { scope: "summary" },
      ttlSeconds: 600,
    });

    expect(token).toBeTruthy();

    const consumed = await storage.consumeTelegramActionToken(token, "tg-1");
    expect(consumed.status).toBe("ok");
    if (consumed.status === "ok") {
      expect(consumed.action).toBe("REFRESH");
      expect(consumed.payload).toEqual({ scope: "summary" });
    }
  });

  it("rejects expired tokens", async () => {
    const token = await storage.createTelegramActionToken({
      telegramUserId: "tg-expired",
      userId: "user-expired",
      action: "REFRESH",
      ttlSeconds: -10,
    });

    const consumed = await storage.consumeTelegramActionToken(token, "tg-expired");
    expect(consumed.status).toBe("expired");
  });

  it("rejects reused tokens", async () => {
    const token = await storage.createTelegramActionToken({
      telegramUserId: "tg-used",
      userId: "user-used",
      action: "REFRESH",
      ttlSeconds: 600,
    });

    const first = await storage.consumeTelegramActionToken(token, "tg-used");
    expect(first.status).toBe("ok");

    const second = await storage.consumeTelegramActionToken(token, "tg-used");
    expect(second.status).toBe("used");
  });

  it("rejects mismatched telegram user ids", async () => {
    const token = await storage.createTelegramActionToken({
      telegramUserId: "tg-owner",
      userId: "user-owner",
      action: "REFRESH",
      ttlSeconds: 600,
    });

    const consumed = await storage.consumeTelegramActionToken(token, "tg-other");
    expect(consumed.status).toBe("invalid");
  });
});
