import { formatMoney } from "@shared/schema";

export const computeReceiveMinor = (amountMinor: string, networkFeeMinor: string): bigint => {
  const amount = BigInt(amountMinor || "0");
  const fee = BigInt(networkFeeMinor || "0");
  return amount > fee ? amount - fee : 0n;
};

export const formatReceiveAmount = (receiveMinor: bigint): string => {
  return formatMoney(receiveMinor.toString(), "USDT");
};

export const getReceiveDisplay = (amountMinor: string, networkFeeMinor: string): string => {
  return formatReceiveAmount(computeReceiveMinor(amountMinor, networkFeeMinor));
};
