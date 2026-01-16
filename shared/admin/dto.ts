import { z } from "zod";

export const AdminListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["asc", "desc"]).default("desc"),
});
export type AdminListQuery = z.infer<typeof AdminListQuery>;

export const AdminUserListItem = z.object({
  id: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  createdAt: z.string(),
  kycStatus: z.string().nullable(),
  isActive: z.boolean(),
});
export type AdminUserListItem = z.infer<typeof AdminUserListItem>;

export const AdminUserDetail = AdminUserListItem.extend({
  profileImageUrl: z.string().nullable(),
  securitySettings: z
    .object({
      twoFactorEnabled: z.boolean().nullable(),
      contactVerified: z.boolean().nullable(),
      consentAccepted: z.boolean().nullable(),
      kycStatus: z.string().nullable(),
    })
    .nullable(),
  balances: z.array(
    z.object({
      asset: z.string(),
      available: z.string(),
      locked: z.string(),
    })
  ),
});
export type AdminUserDetail = z.infer<typeof AdminUserDetail>;

export const AdminOperationListItem = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string(),
  type: z.string(),
  amount: z.string().nullable(),
  asset: z.string().nullable(),
  status: z.string(),
  fee: z.string().nullable(),
});
export type AdminOperationListItem = z.infer<typeof AdminOperationListItem>;

export const AdminOperationDetail = AdminOperationListItem.extend({
  strategyId: z.string().nullable(),
  strategyName: z.string().nullable(),
  txHash: z.string().nullable(),
  providerRef: z.string().nullable(),
  fromVault: z.string().nullable(),
  toVault: z.string().nullable(),
  metadata: z.unknown().nullable(),
  reason: z.string().nullable(),
});
export type AdminOperationDetail = z.infer<typeof AdminOperationDetail>;

export const AdminInboxListItem = z.object({
  id: z.string(),
  createdAt: z.string(),
  type: z.string(),
  priority: z.string(),
  status: z.string(),
  userId: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  nextAction: z.string().nullable(),
});
export type AdminInboxListItem = z.infer<typeof AdminInboxListItem>;

export const AdminMeResponse = z.object({
  adminUserId: z.string(),
  userId: z.string(),
  email: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type AdminMeResponse = z.infer<typeof AdminMeResponse>;

export function decodeCursor(cursor: string): { createdAt: Date; id: number | string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const [ts, id] = decoded.split("|");
    return { createdAt: new Date(ts), id: isNaN(Number(id)) ? id : Number(id) };
  } catch {
    return null;
  }
}

export function encodeCursor(createdAt: Date, id: number | string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64");
}

export const IncidentSeverity = ["info", "warning", "critical", "maintenance"] as const;
export const IncidentStatus = ["DRAFT", "SCHEDULED", "ACTIVE", "RESOLVED", "CANCELLED"] as const;

export const INCIDENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SCHEDULED", "ACTIVE", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["RESOLVED"],
  RESOLVED: [],
  CANCELLED: [],
};

export const CreateIncidentInput = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  severity: z.enum(IncidentSeverity).default("info"),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type CreateIncidentInput = z.infer<typeof CreateIncidentInput>;

export const UpdateIncidentInput = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(2000).optional(),
  severity: z.enum(IncidentSeverity).optional(),
  status: z.enum(IncidentStatus).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});
export type UpdateIncidentInput = z.infer<typeof UpdateIncidentInput>;

export const IncidentListItem = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  status: z.string(),
  title: z.string(),
  message: z.string(),
  severity: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  createdByAdminUserId: z.string(),
  resolvedAt: z.string().nullable(),
});
export type IncidentListItem = z.infer<typeof IncidentListItem>;

export const KycDecisionType = ["APPROVED", "REJECTED", "NEEDS_ACTION", "ON_HOLD"] as const;

export const AdminKycDecisionBody = z.object({
  decision: z.enum(KycDecisionType),
  reason: z.string().min(1).max(1000),
  details: z.record(z.unknown()).optional(),
});
export type AdminKycDecisionBody = z.infer<typeof AdminKycDecisionBody>;

export const AdminKycApplicantListItem = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string().nullable(),
  status: z.string(),
  level: z.string().nullable(),
  riskLevel: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
});
export type AdminKycApplicantListItem = z.infer<typeof AdminKycApplicantListItem>;

export const AdminKycApplicantDetail = AdminKycApplicantListItem.extend({
  providerRef: z.string().nullable(),
  pepFlag: z.boolean().nullable(),
  rejectionReason: z.string().nullable(),
  needsActionReason: z.string().nullable(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    createdAt: z.string().nullable(),
  }).nullable(),
  allowedTransitions: z.array(z.string()),
});
export type AdminKycApplicantDetail = z.infer<typeof AdminKycApplicantDetail>;

export const KYC_ADMIN_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: [],
  IN_REVIEW: ["APPROVED", "NEEDS_ACTION", "REJECTED", "ON_HOLD"],
  APPROVED: [],
  NEEDS_ACTION: [],
  REJECTED: [],
  ON_HOLD: ["APPROVED", "REJECTED"],
};

// ==================== WITHDRAWALS ====================

export const AdminWithdrawalListItem = z.object({
  id: z.string(),
  createdAt: z.string(),
  userId: z.string(),
  email: z.string().nullable(),
  amountMinor: z.string(),
  feeMinor: z.string(),
  currency: z.string(),
  status: z.string(),
  addressShort: z.string(),
  operationId: z.string().nullable(),
  riskScore: z.number().nullable(),
});
export type AdminWithdrawalListItem = z.infer<typeof AdminWithdrawalListItem>;

export const AdminWithdrawalDetail = AdminWithdrawalListItem.extend({
  address: z.string(),
  riskFlags: z.array(z.string()).nullable(),
  lastError: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  rejectedBy: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  processedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  txHash: z.string().nullable(),
  updatedAt: z.string().nullable(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
  }).nullable(),
  linkedOperation: z.object({
    id: z.string(),
    type: z.string(),
    status: z.string(),
    amount: z.string().nullable(),
    fee: z.string().nullable(),
    createdAt: z.string(),
  }).nullable(),
  pendingAction: z.object({
    id: z.string(),
    actionType: z.string(),
    status: z.string(),
    makerAdminUserId: z.string(),
    createdAt: z.string(),
  }).nullable(),
  allowedTransitions: z.array(z.string()),
});
export type AdminWithdrawalDetail = z.infer<typeof AdminWithdrawalDetail>;

export const WithdrawalDecisionType = ["APPROVE", "REJECT"] as const;

export const AdminWithdrawalDecisionBody = z.object({
  action: z.enum(WithdrawalDecisionType),
  reason: z.string().min(1).max(1000),
});
export type AdminWithdrawalDecisionBody = z.infer<typeof AdminWithdrawalDecisionBody>;

export const WithdrawalProcessAction = ["MARK_PROCESSING", "MARK_COMPLETED", "MARK_FAILED"] as const;

export const AdminWithdrawalProcessBody = z.object({
  action: z.enum(WithdrawalProcessAction),
  reason: z.string().min(1).max(1000),
  txHash: z.string().optional(),
  error: z.string().optional(),
});
export type AdminWithdrawalProcessBody = z.infer<typeof AdminWithdrawalProcessBody>;

export const WITHDRAWAL_ADMIN_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: ["PROCESSING"],
  REJECTED: [],
  CANCELLED: [],
};
