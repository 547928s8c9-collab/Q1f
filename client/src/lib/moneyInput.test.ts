import { describe, it, expect } from "vitest";
import { getMoneyInputState, normalizeMoneyInput } from "./moneyInput";

describe("moneyInput helpers", () => {
  it("normalizes comma decimals and strips separators", () => {
    expect(normalizeMoneyInput("1,25")).toBe("1.25");
    expect(normalizeMoneyInput("10,000.50")).toBe("10000.50");
  });

  it("parses valid amounts into minor units", () => {
    const state = getMoneyInputState("12.5", "USDT");
    expect(state.error).toBe("");
    expect(state.minor).toBe("12500000");
  });

  it("rejects too many decimals", () => {
    const state = getMoneyInputState("1.234", "RUB");
    expect(state.minor).toBeNull();
    expect(state.error).toContain("decimal");
  });
});
