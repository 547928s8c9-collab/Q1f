import { describe, it, expect } from "vitest";
import { applyDailyPayoutToBalance } from "../payout/dailyPayout";

describe("daily payout model A", () => {
  it("credits balance without increasing position value", () => {
    const positionValue = "1000000";
    const balanceAvailable = "2000000";
    const payoutAmount = "50000";

    const beforeTotal = BigInt(positionValue) + BigInt(balanceAvailable);
    const result = applyDailyPayoutToBalance({
      positionCurrentValue: positionValue,
      balanceAvailable,
      payoutAmount,
    });
    const afterTotal = BigInt(result.positionCurrentValue) + BigInt(result.balanceAvailable);

    expect(result.positionCurrentValue).toBe(positionValue);
    expect(result.balanceAvailable).toBe((BigInt(balanceAvailable) + BigInt(payoutAmount)).toString());
    expect(afterTotal).toBe(beforeTotal + BigInt(payoutAmount));
  });
});
