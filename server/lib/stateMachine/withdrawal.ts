import { WithdrawalStatus, type WithdrawalStatusType } from "@shared/schema";

export const WithdrawalTransitions: Record<WithdrawalStatusType, WithdrawalStatusType[]> = {
  [WithdrawalStatus.PENDING_REVIEW]: [
    WithdrawalStatus.PENDING_APPROVAL,
    WithdrawalStatus.REJECTED,
    WithdrawalStatus.CANCELLED,
  ],
  [WithdrawalStatus.PENDING_APPROVAL]: [
    WithdrawalStatus.APPROVED,
    WithdrawalStatus.REJECTED,
    WithdrawalStatus.CANCELLED,
  ],
  [WithdrawalStatus.PENDING]: [
    WithdrawalStatus.PENDING_APPROVAL,
    WithdrawalStatus.REJECTED,
    WithdrawalStatus.CANCELLED,
  ],
  [WithdrawalStatus.APPROVED]: [
    WithdrawalStatus.PROCESSING,
    WithdrawalStatus.CANCELLED,
  ],
  [WithdrawalStatus.PROCESSING]: [
    WithdrawalStatus.COMPLETED,
    WithdrawalStatus.FAILED,
  ],
  [WithdrawalStatus.COMPLETED]: [],
  [WithdrawalStatus.FAILED]: [
    WithdrawalStatus.PROCESSING,
  ],
  [WithdrawalStatus.REJECTED]: [],
  [WithdrawalStatus.CANCELLED]: [],
};

export function isValidWithdrawalTransition(
  from: WithdrawalStatusType,
  to: WithdrawalStatusType
): boolean {
  const allowed = WithdrawalTransitions[from] || [];
  return allowed.includes(to);
}

export function getAllowedWithdrawalTransitions(
  status: WithdrawalStatusType
): WithdrawalStatusType[] {
  return WithdrawalTransitions[status] || [];
}
