import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tma.js/init-data-node", () => ({
  parse: vi.fn(),
  validate: vi.fn(),
}));

const { parse, validate } = await import("@tma.js/init-data-node");
const { validateTelegramInitData } = await import("../telegram/validateInitData");

describe("validateTelegramInitData", () => {
  beforeEach(() => {
    vi.mocked(validate).mockReset();
    vi.mocked(parse).mockReset();
  });

  it("throws 400 when initData is empty", () => {
    try {
      validateTelegramInitData("", "test-token");
      throw new Error("Expected validation to throw");
    } catch (error) {
      expect(error).toHaveProperty("status", 400);
    }
  });

  it("throws 400 when auth_date is too old", () => {
    vi.mocked(validate).mockReturnValue(undefined);
    vi.mocked(parse).mockReturnValue({
      user: { id: 123 },
      auth_date: Math.floor(Date.now() / 1000) - 90000,
    });

    try {
      validateTelegramInitData("signed", "test-token", 86400);
      throw new Error("Expected validation to throw");
    } catch (error) {
      expect(error).toHaveProperty("status", 400);
    }
  });

  it("throws 400 when auth_date is invalid", () => {
    vi.mocked(validate).mockReturnValue(undefined);
    vi.mocked(parse).mockReturnValue({
      user: { id: 123 },
      auth_date: "not-a-number",
    });

    try {
      validateTelegramInitData("signed", "test-token", 86400);
      throw new Error("Expected validation to throw");
    } catch (error) {
      expect(error).toHaveProperty("status", 400);
    }
  });
});
