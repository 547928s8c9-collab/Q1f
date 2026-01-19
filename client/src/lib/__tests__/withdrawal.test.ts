import { describe, expect, it } from "vitest";
import {
  getMaxWithdrawableMinor,
  getNetReceiveMinor,
  getTotalDeductMinor,
  meetsMinimumWithdrawal,
} from "../withdrawal";

describe("withdrawal helpers (unit)", () => {
  it("calculates total deduction", () => {
    expect(getTotalDeductMinor("2500000", "1000000")).toBe("3500000");
  });

  it("clamps net receive to zero", () => {
    expect(getNetReceiveMinor("500000", "1000000")).toBe("0");
  });

  it("clamps max withdrawable to zero when fee exceeds balance", () => {
    expect(getMaxWithdrawableMinor("500000", "1000000")).toBe("0");
  });

  it("checks minimum withdrawal threshold", () => {
    expect(meetsMinimumWithdrawal("10000000", "10000000")).toBe(true);
    expect(meetsMinimumWithdrawal("9999999", "10000000")).toBe(false);
  });
});
