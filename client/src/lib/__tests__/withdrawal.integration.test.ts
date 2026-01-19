import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@shared/schema";
import { getNetReceiveMinor, getTotalDeductMinor, getMaxWithdrawableMinor } from "../withdrawal";

describe("withdrawal helpers (integration)", () => {
  it("formats net receive using shared money helpers", () => {
    const amountMinor = parseMoney("12.50", "USDT");
    const networkFeeMinor = "1000000";
    const netMinor = getNetReceiveMinor(amountMinor, networkFeeMinor);
    expect(formatMoney(netMinor, "USDT")).toBe("11.50");
  });

  it("computes max withdrawable after network fee", () => {
    const availableMinor = parseMoney("5.00", "USDT");
    const networkFeeMinor = parseMoney("1.00", "USDT");
    const maxMinor = getMaxWithdrawableMinor(availableMinor, networkFeeMinor);
    expect(getTotalDeductMinor(maxMinor, networkFeeMinor)).toBe(availableMinor);
  });
});
