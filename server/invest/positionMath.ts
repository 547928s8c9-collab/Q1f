export interface PositionInvestmentFields {
  principal: string;
  currentValue: string;
  principalMinor: string;
  investedCurrentMinor: string;
}

export function buildNewPositionInvestment(amountMinor: string): PositionInvestmentFields {
  const amount = BigInt(amountMinor);
  const value = amount.toString();
  return {
    principal: value,
    currentValue: value,
    principalMinor: value,
    investedCurrentMinor: value,
  };
}

export function applyInvestmentToExistingPosition(
  existing: PositionInvestmentFields,
  amountMinor: string
): PositionInvestmentFields {
  const amount = BigInt(amountMinor);
  return {
    principal: (BigInt(existing.principal || "0") + amount).toString(),
    currentValue: (BigInt(existing.currentValue || "0") + amount).toString(),
    principalMinor: (BigInt(existing.principalMinor || "0") + amount).toString(),
    investedCurrentMinor: (BigInt(existing.investedCurrentMinor || "0") + amount).toString(),
  };
}
