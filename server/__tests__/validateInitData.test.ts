import { describe, it, expect } from "vitest";
import { validateTelegramInitData } from "../telegram/validateInitData";

describe("validateTelegramInitData", () => {
  it("throws 400 when initData is empty", () => {
    try {
      validateTelegramInitData("", "test-token");
      throw new Error("Expected validation to throw");
    } catch (error) {
      expect(error).toHaveProperty("status", 400);
    }
  });
});
