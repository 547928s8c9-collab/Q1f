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
