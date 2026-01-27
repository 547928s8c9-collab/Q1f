import { describe, expect, it } from "vitest";
import { computeReceiveMinor, getReceiveDisplay } from "./withdrawCalculations";

describe("withdraw calculations", () => {
  it("returns zero when network fee exceeds amount", () => {
    expect(computeReceiveMinor("1000", "2000")).toBe(0n);
  });

  it("formats receive amounts without floating point rounding", () => {
    const receive = getReceiveDisplay("1234500000", "0");
    expect(receive).toBe("1,234.50");
  });
});
