export function getTotalDeductMinor(amountMinor: string, networkFeeMinor: string): string {
  return (BigInt(amountMinor) + BigInt(networkFeeMinor)).toString();
}

export function getNetReceiveMinor(amountMinor: string, networkFeeMinor: string): string {
  const net = BigInt(amountMinor) - BigInt(networkFeeMinor);
  return net > 0n ? net.toString() : "0";
}

export function getMaxWithdrawableMinor(availableMinor: string, networkFeeMinor: string): string {
  const max = BigInt(availableMinor) - BigInt(networkFeeMinor);
  return max > 0n ? max.toString() : "0";
}

export function meetsMinimumWithdrawal(amountMinor: string, minimumMinor: string): boolean {
  return BigInt(amountMinor) >= BigInt(minimumMinor);
}
