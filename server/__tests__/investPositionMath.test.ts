import { describe, it, expect } from "vitest";
import {
  applyInvestmentToExistingPosition,
  buildNewPositionInvestment,
} from "../invest/positionMath";

describe("position investment math", () => {
  it("sets minor fields on new position", () => {
    const result = buildNewPositionInvestment("1000000");
    expect(result.principalMinor).toBe("1000000");
    expect(result.investedCurrentMinor).toBe("1000000");
    expect(result.principal).toBe("1000000");
    expect(result.currentValue).toBe("1000000");
  });

  it("increments minor fields on existing position", () => {
    const result = applyInvestmentToExistingPosition(
      {
        principal: "5000000",
        currentValue: "5200000",
        principalMinor: "5000000",
        investedCurrentMinor: "5200000",
      },
      "1000000"
    );

    expect(result.principalMinor).toBe("6000000");
    expect(result.investedCurrentMinor).toBe("6200000");
    expect(result.principal).toBe("6000000");
    expect(result.currentValue).toBe("6200000");
  });
});
