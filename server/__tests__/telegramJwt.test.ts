import { describe, expect, it } from "vitest";
import { signTelegramJwt, verifyTelegramJwt } from "../telegram/jwt";

describe("telegram jwt", () => {
  it("signs and verifies a telegram jwt", () => {
    process.env.TELEGRAM_JWT_SECRET = "test-secret";

    const token = signTelegramJwt({ userId: "user-1", telegramUserId: "tg-1" }, "2h");
    const payload = verifyTelegramJwt(token);

    expect(payload.userId).toBe("user-1");
    expect(payload.telegramUserId).toBe("tg-1");
    expect(payload.exp).toBeTypeOf("number");
  });
});
