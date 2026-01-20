import { describe, it, expect } from "vitest";
import { InvestStates, canTransition, transitionState } from "./investStateMachine";

describe("investStateMachine", () => {
  it("allows legal transitions", () => {
    expect(canTransition(InvestStates.NOT_INVESTED, InvestStates.INVESTED_ACTIVE)).toBe(true);
    expect(canTransition(InvestStates.INVESTED_ACTIVE, InvestStates.PAUSED)).toBe(true);
    expect(canTransition(InvestStates.PAUSED, InvestStates.WITHDRAWING)).toBe(true);
  });

  it("rejects illegal transitions", () => {
    const result = transitionState(InvestStates.NOT_INVESTED, InvestStates.PAUSED);
    expect(result.ok).toBe(false);
  });
});
