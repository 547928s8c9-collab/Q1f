export const InvestStates = {
  NOT_INVESTED: "NOT_INVESTED",
  INVESTED_ACTIVE: "INVESTED_ACTIVE",
  PAUSED: "PAUSED",
  WITHDRAWING: "WITHDRAWING",
  CLOSED: "CLOSED",
} as const;

export type InvestState = typeof InvestStates[keyof typeof InvestStates];

const transitions: Record<InvestState, InvestState[]> = {
  NOT_INVESTED: ["INVESTED_ACTIVE"],
  INVESTED_ACTIVE: ["PAUSED", "WITHDRAWING"],
  PAUSED: ["INVESTED_ACTIVE", "WITHDRAWING"],
  WITHDRAWING: ["CLOSED"],
  CLOSED: ["INVESTED_ACTIVE"],
};

export function canTransition(current: InvestState, next: InvestState): boolean {
  return transitions[current]?.includes(next) ?? false;
}

export function transitionState(current: InvestState, next: InvestState): { ok: true; state: InvestState } | { ok: false; error: string } {
  if (current === next) {
    return { ok: true, state: current };
  }
  if (!canTransition(current, next)) {
    return { ok: false, error: `Illegal transition from ${current} to ${next}` };
  }
  return { ok: true, state: next };
}
