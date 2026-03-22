export interface RiskRule {
  type: "DD_BREACH" | "LOSS_LIMIT" | "VOLATILITY";
  message: string;
}

export interface RiskCheckResult {
  shouldPause: boolean;
  triggeredRule: RiskRule | null;
}

export async function checkRiskRules(
  _userId: string,
  _strategyId: string,
  _positionId: string
): Promise<RiskCheckResult> {
  return { shouldPause: false, triggeredRule: null };
}

export async function applyRiskRuleAction(
  _userId: string,
  _strategyId: string,
  _positionId: string,
  _rule: RiskRule
): Promise<void> {
}
