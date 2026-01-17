export interface DailyPayoutInputs {
  positionCurrentValue: string;
  balanceAvailable: string;
  payoutAmount: string;
}

export interface DailyPayoutResult {
  positionCurrentValue: string;
  balanceAvailable: string;
}

// Model A: profit paid to balance, position value unchanged.
export function applyDailyPayoutToBalance({
  positionCurrentValue,
  balanceAvailable,
  payoutAmount,
}: DailyPayoutInputs): DailyPayoutResult {
  const newBalance = (BigInt(balanceAvailable || "0") + BigInt(payoutAmount)).toString();
  return {
    positionCurrentValue,
    balanceAvailable: newBalance,
  };
}
