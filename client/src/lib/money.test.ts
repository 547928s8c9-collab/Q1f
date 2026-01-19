import { describe, expect, it } from "vitest";
import { toMinorUnits } from "./money";

describe("toMinorUnits", () => {
  it("converts 2-decimal amounts to minor units", () => {
    expect(toMinorUnits("10,5", 2)).toBe("1050");
    expect(toMinorUnits("1 234.50", 2)).toBe("123450");
    expect(toMinorUnits("0.00", 2)).toBe("0");
  });

  it("converts 6-decimal amounts to minor units", () => {
    expect(toMinorUnits("1.2345", 6)).toBe("1234500");
    expect(toMinorUnits("0.000001", 6)).toBe("1");
  });

  it("returns empty string for invalid input", () => {
    expect(toMinorUnits("", 2)).toBe("");
    expect(toMinorUnits(".", 2)).toBe("");
    expect(toMinorUnits("1.2.3", 2)).toBe("");
    expect(toMinorUnits("10a", 2)).toBe("");
  });
});
