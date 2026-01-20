import { Router } from "express";
import { ensureRequestId } from "./middleware/requestId";
import { adminAuth } from "./middleware/adminAuth";
import { loadPermissions, requirePermission } from "./middleware/rbac";
import { ok, fail, ErrorCodes } from "./http";
import { db, withTransaction } from "../db";
import {
  users,
  kycApplicants,
  balances,
  operations,
  securitySettings,
  adminInboxItems,
  incidents,
  withdrawals,
  pendingAdminActions,
  PendingActionStatus,
  KycStatusToSecurityStatus,
  notifications,
  type KycStatusType,
} from "@shared/schema";
import { eq, desc, and, lt, or, ilike, sql, count, sum, gte } from "drizzle-orm";
import {
  AdminListQuery,
  encodeCursor,
  decodeCursor,
  type AdminUserListItem,
  type AdminUserDetail,
  type AdminOperationListItem,
  type AdminOperationDetail,
  type AdminInboxListItem,
  CreateIncidentInput,
  UpdateIncidentInput,
  INCIDENT_TRANSITIONS,
  type IncidentListItem,
  AdminKycDecisionBody,
  KYC_ADMIN_TRANSITIONS,
  type AdminKycApplicantListItem,
  type AdminKycApplicantDetail,
  type AdminWithdrawalListItem,
  type AdminWithdrawalDetail,
  AdminWithdrawalDecisionBody,
  AdminWithdrawalProcessBody,
  WITHDRAWAL_ADMIN_TRANSITIONS,
} from "@shared/admin/dto";
import { requireIdempotencyKey, wrapMutation } from "./audit";
import { engineScheduler } from "../app/engineScheduler";

export const adminRouter = Router();

adminRouter.use(ensureRequestId);
adminRouter.use(adminAuth);
adminRouter.use(loadPermissions);

adminRouter.get("/me", async (req, res) => {
  try {
    const adminUserId = res.locals.adminUserId!;
    const userId = res.locals.userId!;
    const email = res.locals.email!;
    const roles = res.locals.roleKeys || [];
    const permissions = Array.from(res.locals.permissionKeys || []);

    ok(res, {
      adminUserId,
      userId,
      email,
      roles,
      permissions,
    });
  } catch (error) {
    console.error("[GET /admin/me]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to get admin info", 500);
  }
});

adminRouter.get("/overview", requirePermission("users.read"), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      usersCountResult,
      activeUsersResult,
      balancesAggResult,
      pendingWithdrawalsResult,
      kycPendingResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() })
        .from(operations)
        .where(gte(operations.createdAt, thirtyDaysAgo))
        .groupBy(operations.userId),
      db.select({
        totalAvailable: sql<string>`COALESCE(SUM(CAST(${balances.available} AS BIGINT)), 0)::text`,
        totalLocked: sql<string>`COALESCE(SUM(CAST(${balances.locked} AS BIGINT)), 0)::text`,
      }).from(balances).where(eq(balances.asset, "USDT")),
      db.select({
        count: count(),
        totalAmount: sql<string>`COALESCE(SUM(CAST(${withdrawals.amountMinor} AS BIGINT)), 0)::text`,
      }).from(withdrawals).where(eq(withdrawals.status, "PENDING")),
      db.select({ count: count() })
        .from(kycApplicants)
        .where(eq(kycApplicants.status, "IN_REVIEW")),
    ]);

    const usersTotal = usersCountResult[0]?.count ?? 0;
    const usersActive = activeUsersResult.length;
    const totalAvailable = balancesAggResult[0]?.totalAvailable ?? "0";
    const totalLocked = balancesAggResult[0]?.totalLocked ?? "0";
    const totalAUMMinor = (BigInt(totalAvailable) + BigInt(totalLocked)).toString();
    const pendingWithdrawalsCount = pendingWithdrawalsResult[0]?.count ?? 0;
    const pendingWithdrawalsAmountMinor = pendingWithdrawalsResult[0]?.totalAmount ?? "0";
    const kycPendingCount = kycPendingResult[0]?.count ?? 0;

    ok(res, {
      usersTotal,
      usersActive,
      totalAUMMinor,
      pendingWithdrawalsCount,
      pendingWithdrawalsAmountMinor,
      kycPendingCount,
    });
  } catch (error) {
    console.error("[GET /admin/overview]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to get overview metrics", 500);
  }
});

adminRouter.get("/health/engine", requirePermission("users.read"), async (_req, res) => {
  try {
    ok(res, engineScheduler.getHealth());
  } catch (error) {
    console.error("[GET /admin/health/engine]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to load engine health", 500);
  }
});

adminRouter.get("/users", requirePermission("users.read"), async (req, res) => {
  try {
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "Invalid query", 400, query.error.issues);
    }

    const { limit, cursor, q, sort } = query.data;

    let whereClause = undefined;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        whereClause = lt(users.createdAt, decoded.createdAt);
      }
    }

    let baseQuery = db.select().from(users);

    if (whereClause) {
      baseQuery = baseQuery.where(whereClause) as typeof baseQuery;
    }

    if (q) {
      const searchCondition = or(
        ilike(users.email, `%${q}%`),
        ilike(users.firstName, `%${q}%`),
        ilike(users.lastName, `%${q}%`)
      );
      baseQuery = baseQuery.where(
        whereClause ? and(whereClause, searchCondition) : searchCondition
      ) as typeof baseQuery;
    }

    const rows = await baseQuery
      .orderBy(sort === "asc" ? users.createdAt : desc(users.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const kycStatuses = await Promise.all(
      items.map(async (u) => {
        const [kyc] = await db
          .select({ status: kycApplicants.status })
          .from(kycApplicants)
          .where(eq(kycApplicants.userId, u.id))
          .limit(1);
        return kyc?.status || null;
      })
    );

    const result: AdminUserListItem[] = items.map((u, i) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      createdAt: u.createdAt?.toISOString() || new Date().toISOString(),
      kycStatus: kycStatuses[i],
      isActive: true,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : null;

    ok(res, result, { limit, nextCursor });
  } catch (error) {
    console.error("[GET /admin/users]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch users", 500);
  }
});

adminRouter.get("/users/:id", requirePermission("users.read"), async (req, res) => {
  try {
    const userId = req.params.id;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      return fail(res, ErrorCodes.NOT_FOUND, "User not found", 404);
    }

    const [kyc] = await db
      .select({ status: kycApplicants.status })
      .from(kycApplicants)
      .where(eq(kycApplicants.userId, userId))
      .limit(1);

    const [security] = await db
      .select()
      .from(securitySettings)
      .where(eq(securitySettings.userId, userId))
      .limit(1);

    const userBalances = await db
      .select()
      .from(balances)
      .where(eq(balances.userId, userId));

    const result: AdminUserDetail = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
      kycStatus: kyc?.status || null,
      isActive: true,
      profileImageUrl: user.profileImageUrl,
      securitySettings: security
        ? {
            twoFactorEnabled: security.twoFactorEnabled,
            contactVerified: security.contactVerified,
            consentAccepted: security.consentAccepted,
            kycStatus: security.kycStatus,
          }
        : null,
      balances: userBalances.map((b) => ({
        asset: b.asset,
        available: b.available,
        locked: b.locked,
      })),
    };

    ok(res, result);
  } catch (error) {
    console.error("[GET /admin/users/:id]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch user", 500);
  }
});

adminRouter.post(
  "/users/:id/block",
  requirePermission("users.update"),
  requireIdempotencyKey,
  wrapMutation("user.block", async (req, res, context) => {
    const userId = req.params.id;
    const { reason } = req.body || {};

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return {
        status: 400,
        body: { ok: false, error: { code: "VALIDATION_ERROR", message: "Reason is required" }, requestId: context.requestId },
      };
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return {
        status: 404,
        body: { ok: false, error: { code: "NOT_FOUND", message: "User not found" }, requestId: context.requestId },
      };
    }

    if (user.isBlocked) {
      return {
        status: 400,
        body: { ok: false, error: { code: "VALIDATION_ERROR", message: "User is already blocked" }, requestId: context.requestId },
      };
    }

    const beforeJson = { isBlocked: user.isBlocked, blockedAt: user.blockedAt, blockedReason: user.blockedReason };
    const now = new Date();

    await db.update(users).set({
      isBlocked: true,
      blockedAt: now,
      blockedReason: reason.trim(),
      updatedAt: now,
    }).where(eq(users.id, userId));

    const afterJson = { isBlocked: true, blockedAt: now.toISOString(), blockedReason: reason.trim() };

    return {
      status: 200,
      body: { ok: true, data: { userId, blocked: true, blockedAt: now.toISOString(), reason: reason.trim() }, requestId: context.requestId },
      targetType: "user",
      targetId: userId,
      beforeJson,
      afterJson,
      reason: reason.trim(),
    };
  })
);

adminRouter.post(
  "/users/:id/unblock",
  requirePermission("users.update"),
  requireIdempotencyKey,
  wrapMutation("user.unblock", async (req, res, context) => {
    const userId = req.params.id;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      return {
        status: 404,
        body: { ok: false, error: { code: "NOT_FOUND", message: "User not found" }, requestId: context.requestId },
      };
    }

    if (!user.isBlocked) {
      return {
        status: 400,
        body: { ok: false, error: { code: "VALIDATION_ERROR", message: "User is not blocked" }, requestId: context.requestId },
      };
    }

    const beforeJson = { isBlocked: user.isBlocked, blockedAt: user.blockedAt, blockedReason: user.blockedReason };
    const now = new Date();

    await db.update(users).set({
      isBlocked: false,
      blockedAt: null,
      blockedReason: null,
      updatedAt: now,
    }).where(eq(users.id, userId));

    const afterJson = { isBlocked: false, blockedAt: null, blockedReason: null };

    return {
      status: 200,
      body: { ok: true, data: { userId, blocked: false }, requestId: context.requestId },
      targetType: "user",
      targetId: userId,
      beforeJson,
      afterJson,
    };
  })
);

adminRouter.get("/operations", requirePermission("money.read"), async (req, res) => {
  try {
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "Invalid query", 400, query.error.issues);
    }

    const { limit, cursor, status, sort } = query.data;

    let whereConditions: any[] = [];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        whereConditions.push(lt(operations.createdAt, decoded.createdAt));
      }
    }

    if (status) {
      whereConditions.push(eq(operations.status, status));
    }

    let baseQuery = db.select().from(operations);

    if (whereConditions.length > 0) {
      baseQuery = baseQuery.where(and(...whereConditions)) as typeof baseQuery;
    }

    const rows = await baseQuery
      .orderBy(sort === "asc" ? operations.createdAt : desc(operations.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const result: AdminOperationListItem[] = items.map((op) => ({
      id: op.id,
      userId: op.userId,
      createdAt: op.createdAt?.toISOString() || new Date().toISOString(),
      type: op.type,
      amount: op.amount,
      asset: op.asset,
      status: op.status,
      fee: op.fee,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : null;

    ok(res, result, { limit, nextCursor });
  } catch (error) {
    console.error("[GET /admin/operations]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch operations", 500);
  }
});

adminRouter.get("/operations/:id", requirePermission("money.read"), async (req, res) => {
  try {
    const operationId = req.params.id;

    const [op] = await db
      .select()
      .from(operations)
      .where(eq(operations.id, operationId))
      .limit(1);

    if (!op) {
      return fail(res, ErrorCodes.NOT_FOUND, "Operation not found", 404);
    }

    const result: AdminOperationDetail = {
      id: op.id,
      userId: op.userId,
      createdAt: op.createdAt?.toISOString() || new Date().toISOString(),
      type: op.type,
      amount: op.amount,
      asset: op.asset,
      status: op.status,
      fee: op.fee,
      strategyId: op.strategyId,
      strategyName: op.strategyName,
      txHash: op.txHash,
      providerRef: op.providerRef,
      fromVault: op.fromVault,
      toVault: op.toVault,
      metadata: op.metadata,
      reason: op.reason,
    };

    ok(res, result);
  } catch (error) {
    console.error("[GET /admin/operations/:id]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch operation", 500);
  }
});

adminRouter.get("/inbox", requirePermission("inbox.read"), async (req, res) => {
  try {
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "Invalid query", 400, query.error.issues);
    }

    const { limit, cursor, status, sort } = query.data;

    let whereConditions: any[] = [];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        whereConditions.push(lt(adminInboxItems.createdAt, decoded.createdAt));
      }
    }

    if (status) {
      whereConditions.push(eq(adminInboxItems.status, status));
    }

    let baseQuery = db.select().from(adminInboxItems);

    if (whereConditions.length > 0) {
      baseQuery = baseQuery.where(and(...whereConditions)) as typeof baseQuery;
    }

    const rows = await baseQuery
      .orderBy(sort === "asc" ? adminInboxItems.createdAt : desc(adminInboxItems.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const result: AdminInboxListItem[] = items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt?.toISOString() || new Date().toISOString(),
      type: item.type,
      priority: item.priority,
      status: item.status,
      userId: item.userId,
      entityType: item.entityType,
      entityId: item.entityId,
      nextAction: item.nextAction,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : null;

    ok(res, result, { limit, nextCursor });
  } catch (error) {
    console.error("[GET /admin/inbox]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch inbox", 500);
  }
});

adminRouter.get("/incidents", requirePermission("incidents.read"), async (req, res) => {
  try {
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "Invalid query", 400, query.error.issues);
    }

    const { limit, cursor, status, sort } = query.data;

    let whereConditions: any[] = [];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        whereConditions.push(lt(incidents.createdAt, decoded.createdAt));
      }
    }

    if (status) {
      whereConditions.push(eq(incidents.status, status));
    }

    let baseQuery = db.select().from(incidents);

    if (whereConditions.length > 0) {
      baseQuery = baseQuery.where(and(...whereConditions)) as typeof baseQuery;
    }

    const rows = await baseQuery
      .orderBy(sort === "asc" ? incidents.createdAt : desc(incidents.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const result: IncidentListItem[] = items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: item.updatedAt?.toISOString() || null,
      status: item.status,
      title: item.title,
      message: item.message,
      severity: item.severity,
      startsAt: item.startsAt?.toISOString() || null,
      endsAt: item.endsAt?.toISOString() || null,
      createdByAdminUserId: item.createdByAdminUserId,
      resolvedAt: item.resolvedAt?.toISOString() || null,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : null;

    ok(res, result, { limit, nextCursor });
  } catch (error) {
    console.error("[GET /admin/incidents]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch incidents", 500);
  }
});

adminRouter.get("/incidents/:id", requirePermission("incidents.read"), async (req, res) => {
  try {
    const incidentId = req.params.id;

    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!incident) {
      return fail(res, ErrorCodes.NOT_FOUND, "Incident not found", 404);
    }

    const result: IncidentListItem = {
      id: incident.id,
      createdAt: incident.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: incident.updatedAt?.toISOString() || null,
      status: incident.status,
      title: incident.title,
      message: incident.message,
      severity: incident.severity,
      startsAt: incident.startsAt?.toISOString() || null,
      endsAt: incident.endsAt?.toISOString() || null,
      createdByAdminUserId: incident.createdByAdminUserId,
      resolvedAt: incident.resolvedAt?.toISOString() || null,
    };

    ok(res, result);
  } catch (error) {
    console.error("[GET /admin/incidents/:id]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch incident", 500);
  }
});

adminRouter.post(
  "/incidents",
  requirePermission("incidents.publish"),
  requireIdempotencyKey,
  wrapMutation("INCIDENT_CREATED", async (req, _res, ctx) => {
    const parsed = CreateIncidentInput.safeParse(req.body);
    if (!parsed.success) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "Invalid input", details: parsed.error.issues },
          requestId: ctx.requestId,
        },
      };
    }

    const input = parsed.data;

    const [created] = await db
      .insert(incidents)
      .values({
        title: input.title,
        message: input.message,
        severity: input.severity,
        status: "DRAFT",
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        createdByAdminUserId: ctx.adminUserId,
      })
      .returning();

    const result: IncidentListItem = {
      id: created.id,
      createdAt: created.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: created.updatedAt?.toISOString() || null,
      status: created.status,
      title: created.title,
      message: created.message,
      severity: created.severity,
      startsAt: created.startsAt?.toISOString() || null,
      endsAt: created.endsAt?.toISOString() || null,
      createdByAdminUserId: created.createdByAdminUserId,
      resolvedAt: created.resolvedAt?.toISOString() || null,
    };

    return {
      status: 201,
      body: { ok: true, data: result, requestId: ctx.requestId },
      targetType: "incident",
      targetId: created.id,
      afterJson: result,
    };
  })
);

adminRouter.patch(
  "/incidents/:id",
  requirePermission("incidents.publish"),
  requireIdempotencyKey,
  wrapMutation("INCIDENT_UPDATED", async (req, _res, ctx) => {
    const incidentId = req.params.id;

    const parsed = UpdateIncidentInput.safeParse(req.body);
    if (!parsed.success) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "Invalid input", details: parsed.error.issues },
          requestId: ctx.requestId,
        },
      };
    }

    const input = parsed.data;

    const [existing] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!existing) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Incident not found" }, requestId: ctx.requestId },
      };
    }

    const beforeJson = {
      id: existing.id,
      status: existing.status,
      title: existing.title,
      message: existing.message,
      severity: existing.severity,
    };

    if (input.status && input.status !== existing.status) {
      const allowedTransitions = INCIDENT_TRANSITIONS[existing.status] || [];
      if (!allowedTransitions.includes(input.status)) {
        return {
          status: 400,
          body: {
            ok: false,
            error: {
              code: ErrorCodes.STATE_TRANSITION_INVALID,
              message: `Cannot transition from ${existing.status} to ${input.status}`,
              allowedTransitions,
            },
            requestId: ctx.requestId,
          },
        };
      }

      if (existing.status === "DRAFT" && input.status === "ACTIVE") {
        const stepUpHeader = req.headers["x-admin-step-up"] as string | undefined;
        const effectiveSeverity = input.severity || existing.severity;
        const isCritical = effectiveSeverity === "critical";
        const hasStepUp = stepUpHeader === "true";

        if (!isCritical && !hasStepUp) {
          return {
            status: 400,
            body: {
              ok: false,
              error: {
                code: ErrorCodes.STATE_TRANSITION_INVALID,
                message: "DRAFT to ACTIVE requires severity=critical or x-admin-step-up:true header",
              },
              requestId: ctx.requestId,
            },
          };
        }
      }
    }

    const updates: any = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.message !== undefined) updates.message = input.message;
    if (input.severity !== undefined) updates.severity = input.severity;
    if (input.status !== undefined) updates.status = input.status;
    if (input.startsAt !== undefined) updates.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) updates.endsAt = input.endsAt ? new Date(input.endsAt) : null;

    if (input.status === "RESOLVED" && existing.status !== "RESOLVED") {
      updates.resolvedAt = new Date();
      updates.resolvedByAdminUserId = ctx.adminUserId;
    }

    const [updated] = await db
      .update(incidents)
      .set(updates)
      .where(eq(incidents.id, incidentId))
      .returning();

    const result: IncidentListItem = {
      id: updated.id,
      createdAt: updated.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: updated.updatedAt?.toISOString() || null,
      status: updated.status,
      title: updated.title,
      message: updated.message,
      severity: updated.severity,
      startsAt: updated.startsAt?.toISOString() || null,
      endsAt: updated.endsAt?.toISOString() || null,
      createdByAdminUserId: updated.createdByAdminUserId,
      resolvedAt: updated.resolvedAt?.toISOString() || null,
    };

    return {
      status: 200,
      body: { ok: true, data: result, requestId: ctx.requestId },
      targetType: "incident",
      targetId: updated.id,
      beforeJson,
      afterJson: result,
    };
  })
);

adminRouter.get("/kyc/applicants", requirePermission("kyc.read"), async (req, res) => {
  try {
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "Invalid query", 400, query.error.issues);
    }

    const { limit, cursor, status, q, sort } = query.data;

    let whereConditions: any[] = [];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        whereConditions.push(lt(kycApplicants.createdAt, decoded.createdAt));
      }
    }

    if (status) {
      whereConditions.push(eq(kycApplicants.status, status));
    }

    let baseQuery = db.select().from(kycApplicants);

    if (whereConditions.length > 0) {
      baseQuery = baseQuery.where(and(...whereConditions)) as typeof baseQuery;
    }

    const rows = await baseQuery
      .orderBy(sort === "asc" ? kycApplicants.createdAt : desc(kycApplicants.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const userEmails = await Promise.all(
      items.map(async (k) => {
        const [user] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, k.userId))
          .limit(1);
        return user?.email || null;
      })
    );

    const result: AdminKycApplicantListItem[] = items.map((k, i) => ({
      id: k.id,
      userId: k.userId,
      email: userEmails[i],
      status: k.status,
      level: k.level,
      riskLevel: k.riskLevel,
      createdAt: k.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: k.updatedAt?.toISOString() || null,
      submittedAt: k.submittedAt?.toISOString() || null,
      reviewedAt: k.reviewedAt?.toISOString() || null,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : null;

    ok(res, result, { limit, nextCursor });
  } catch (error) {
    console.error("[GET /admin/kyc/applicants]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch KYC applicants", 500);
  }
});

adminRouter.get("/kyc/applicants/:id", requirePermission("kyc.read"), async (req, res) => {
  try {
    const applicantId = req.params.id;

    const [applicant] = await db
      .select()
      .from(kycApplicants)
      .where(eq(kycApplicants.id, applicantId))
      .limit(1);

    if (!applicant) {
      return fail(res, ErrorCodes.NOT_FOUND, "KYC applicant not found", 404);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, applicant.userId))
      .limit(1);

    const allowedTransitions = KYC_ADMIN_TRANSITIONS[applicant.status] || [];

    const result: AdminKycApplicantDetail = {
      id: applicant.id,
      userId: applicant.userId,
      email: user?.email || null,
      status: applicant.status,
      level: applicant.level,
      riskLevel: applicant.riskLevel,
      createdAt: applicant.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: applicant.updatedAt?.toISOString() || null,
      submittedAt: applicant.submittedAt?.toISOString() || null,
      reviewedAt: applicant.reviewedAt?.toISOString() || null,
      providerRef: applicant.providerRef,
      pepFlag: applicant.pepFlag,
      rejectionReason: applicant.rejectionReason,
      needsActionReason: applicant.needsActionReason,
      user: user ? {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt?.toISOString() || null,
      } : null,
      allowedTransitions,
    };

    ok(res, result);
  } catch (error) {
    console.error("[GET /admin/kyc/applicants/:id]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch KYC applicant", 500);
  }
});

adminRouter.post(
  "/kyc/applicants/:id/decision",
  requirePermission("kyc.review"),
  requireIdempotencyKey,
  wrapMutation("KYC_DECISION", async (req, _res, ctx) => {
    const applicantId = req.params.id;

    const parsed = AdminKycDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "Invalid input", details: parsed.error.issues },
          requestId: ctx.requestId,
        },
      };
    }

    const input = parsed.data;

    const [existing] = await db
      .select()
      .from(kycApplicants)
      .where(eq(kycApplicants.id, applicantId))
      .limit(1);

    if (!existing) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "KYC applicant not found" }, requestId: ctx.requestId },
      };
    }

    const beforeJson = {
      id: existing.id,
      userId: existing.userId,
      status: existing.status,
      rejectionReason: existing.rejectionReason,
      needsActionReason: existing.needsActionReason,
    };

    const allowedTransitions = KYC_ADMIN_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(input.decision)) {
      return {
        status: 400,
        body: {
          ok: false,
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot transition from ${existing.status} to ${input.decision}`,
            allowedTransitions,
          },
          requestId: ctx.requestId,
        },
      };
    }

    const updates: any = {
      status: input.decision,
      updatedAt: new Date(),
      reviewedAt: new Date(),
    };

    if (input.decision === "REJECTED") {
      updates.rejectionReason = input.reason;
    } else if (input.decision === "NEEDS_ACTION") {
      updates.needsActionReason = input.reason;
    }

    const [updated] = await db
      .update(kycApplicants)
      .set(updates)
      .where(eq(kycApplicants.id, applicantId))
      .returning();

    // Sync securitySettings.kycStatus
    const securityStatus = KycStatusToSecurityStatus[input.decision as KycStatusType];
    if (securityStatus) {
      await db
        .update(securitySettings)
        .set({ kycStatus: securityStatus, updatedAt: new Date() })
        .where(eq(securitySettings.userId, updated.userId));
    }

    // Create user notification
    const notificationMessages: Record<string, { title: string; message: string }> = {
      APPROVED: { title: "KYC Approved", message: "Your identity has been successfully verified." },
      REJECTED: { title: "KYC Rejected", message: input.reason || "Your verification was not successful." },
      NEEDS_ACTION: { title: "Action Required", message: input.reason || "Additional documents are needed." },
      ON_HOLD: { title: "Verification On Hold", message: "Your verification is temporarily on hold for review." },
    };

    const notification = notificationMessages[input.decision];
    if (notification) {
      await db.insert(notifications).values({
        userId: updated.userId,
        type: "kyc",
        title: notification.title,
        message: notification.message,
        resourceType: "kyc",
        resourceId: updated.id,
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, updated.userId))
      .limit(1);

    const result: AdminKycApplicantDetail = {
      id: updated.id,
      userId: updated.userId,
      email: user?.email || null,
      status: updated.status,
      level: updated.level,
      riskLevel: updated.riskLevel,
      createdAt: updated.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: updated.updatedAt?.toISOString() || null,
      submittedAt: updated.submittedAt?.toISOString() || null,
      reviewedAt: updated.reviewedAt?.toISOString() || null,
      providerRef: updated.providerRef,
      pepFlag: updated.pepFlag,
      rejectionReason: updated.rejectionReason,
      needsActionReason: updated.needsActionReason,
      user: user ? {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt?.toISOString() || null,
      } : null,
      allowedTransitions: KYC_ADMIN_TRANSITIONS[updated.status] || [],
    };

    const afterJson = {
      ...beforeJson,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      needsActionReason: updated.needsActionReason,
      decisionReason: input.reason,
      decisionDetails: input.details,
    };

    return {
      status: 200,
      body: { ok: true, data: result, requestId: ctx.requestId },
      targetType: "kyc_applicant",
      targetId: updated.id,
      beforeJson,
      afterJson,
    };
  })
);

// ==================== WITHDRAWALS ====================

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

adminRouter.get("/withdrawals", requirePermission("withdrawals.read"), async (req, res) => {
  try {
    const query = AdminListQuery.safeParse(req.query);
    if (!query.success) {
      return fail(res, ErrorCodes.VALIDATION_ERROR, "Invalid query", 400, query.error.issues);
    }

    const { limit, cursor, q, status, sort } = query.data;

    let whereClause = undefined;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        whereClause = lt(withdrawals.createdAt, decoded.createdAt);
      }
    }

    let baseQuery = db.select().from(withdrawals);

    if (whereClause) {
      baseQuery = baseQuery.where(whereClause) as typeof baseQuery;
    }

    if (status) {
      const statusCondition = eq(withdrawals.status, status);
      baseQuery = baseQuery.where(
        whereClause ? and(whereClause, statusCondition) : statusCondition
      ) as typeof baseQuery;
    }

    const rows = await baseQuery
      .orderBy(sort === "asc" ? withdrawals.createdAt : desc(withdrawals.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const userIds = [...new Set(items.map((w) => w.userId))];
    const userRows = userIds.length > 0
      ? await db.select({ id: users.id, email: users.email }).from(users).where(or(...userIds.map((id) => eq(users.id, id))))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u.email]));

    const result: AdminWithdrawalListItem[] = items.map((w) => ({
      id: w.id,
      createdAt: w.createdAt?.toISOString() || new Date().toISOString(),
      userId: w.userId,
      email: userMap.get(w.userId) || null,
      amountMinor: w.amountMinor,
      feeMinor: w.feeMinor,
      currency: w.currency,
      status: w.status,
      addressShort: shortenAddress(w.address),
      operationId: w.operationId,
      riskScore: w.riskScore,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt!, items[items.length - 1].id)
      : null;

    ok(res, result, { limit, nextCursor });
  } catch (error) {
    console.error("[GET /admin/withdrawals]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch withdrawals", 500);
  }
});

adminRouter.get("/withdrawals/:id", requirePermission("withdrawals.read"), async (req, res) => {
  try {
    const withdrawalId = req.params.id;

    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      return fail(res, ErrorCodes.NOT_FOUND, "Withdrawal not found", 404);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, withdrawal.userId))
      .limit(1);

    let linkedOperation = null;
    if (withdrawal.operationId) {
      const [op] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, withdrawal.operationId))
        .limit(1);
      if (op) {
        linkedOperation = {
          id: op.id,
          type: op.type,
          status: op.status,
          amount: op.amount,
          fee: op.fee,
          createdAt: op.createdAt?.toISOString() || new Date().toISOString(),
        };
      }
    }

    const [pendingAction] = await db
      .select()
      .from(pendingAdminActions)
      .where(and(
        eq(pendingAdminActions.targetType, "withdrawal"),
        eq(pendingAdminActions.targetId, withdrawalId),
        eq(pendingAdminActions.status, PendingActionStatus.PENDING)
      ))
      .limit(1);

    const allowedTransitions = WITHDRAWAL_ADMIN_TRANSITIONS[withdrawal.status] || [];

    const result: AdminWithdrawalDetail = {
      id: withdrawal.id,
      createdAt: withdrawal.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: withdrawal.updatedAt?.toISOString() || null,
      userId: withdrawal.userId,
      email: user?.email || null,
      amountMinor: withdrawal.amountMinor,
      feeMinor: withdrawal.feeMinor,
      currency: withdrawal.currency,
      status: withdrawal.status,
      address: withdrawal.address,
      addressShort: shortenAddress(withdrawal.address),
      operationId: withdrawal.operationId,
      riskScore: withdrawal.riskScore,
      riskFlags: Array.isArray(withdrawal.riskFlags) ? withdrawal.riskFlags as string[] : null,
      lastError: withdrawal.lastError,
      reviewedByAdminId: withdrawal.reviewedByAdminId,
      reviewedAt: withdrawal.reviewedAt?.toISOString() || null,
      approvedBy: withdrawal.approvedBy,
      approvedAt: withdrawal.approvedAt?.toISOString() || null,
      rejectedBy: withdrawal.rejectedBy,
      rejectedAt: withdrawal.rejectedAt?.toISOString() || null,
      rejectionReason: withdrawal.rejectionReason,
      processedAt: withdrawal.processedAt?.toISOString() || null,
      completedAt: withdrawal.completedAt?.toISOString() || null,
      txHash: withdrawal.txHash,
      user: user ? {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      } : null,
      linkedOperation,
      pendingAction: pendingAction ? {
        id: pendingAction.id,
        actionType: pendingAction.actionType,
        status: pendingAction.status,
        makerAdminUserId: pendingAction.makerAdminUserId,
        createdAt: pendingAction.createdAt?.toISOString() || new Date().toISOString(),
      } : null,
      allowedTransitions,
    };

    ok(res, result);
  } catch (error) {
    console.error("[GET /admin/withdrawals/:id]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to fetch withdrawal", 500);
  }
});

adminRouter.post(
  "/withdrawals/:id/review",
  requirePermission("withdrawals.approve"),
  requireIdempotencyKey,
  wrapMutation("WITHDRAWAL_REVIEW", async (req, _res, ctx) => {
    const withdrawalId = req.params.id;
    const adminUserId = ctx.adminUserId;

    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Withdrawal not found" }, requestId: ctx.requestId },
      };
    }

    if (withdrawal.status !== "PENDING_REVIEW" && withdrawal.status !== "PENDING") {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "INVALID_STATUS", message: `Cannot review withdrawal in status: ${withdrawal.status}` },
          requestId: ctx.requestId,
        },
      };
    }

    const beforeJson = { status: withdrawal.status, reviewedByAdminId: null, reviewedAt: null };
    const now = new Date();

    const [updated] = await db.update(withdrawals)
      .set({
        status: "PENDING_APPROVAL",
        reviewedByAdminId: adminUserId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(withdrawals.id, withdrawalId))
      .returning();

    const afterJson = { status: "PENDING_APPROVAL", reviewedByAdminId: adminUserId, reviewedAt: now.toISOString() };

    return {
      status: 200,
      body: {
        ok: true,
        data: { withdrawalId: updated.id, status: updated.status, reviewedByAdminId: adminUserId },
        requestId: ctx.requestId,
      },
      targetType: "withdrawal",
      targetId: withdrawalId,
      beforeJson,
      afterJson,
    };
  })
);

adminRouter.post(
  "/withdrawals/:id/request-approval",
  requirePermission("withdrawals.approve"),
  requireIdempotencyKey,
  wrapMutation("WITHDRAWAL_APPROVAL_REQUEST", async (req, _res, ctx) => {
    const withdrawalId = req.params.id;
    const adminUserId = ctx.adminUserId;

    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Withdrawal not found" }, requestId: ctx.requestId },
      };
    }

    if (withdrawal.status !== "PENDING_APPROVAL" && withdrawal.status !== "PENDING") {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "INVALID_STATUS", message: `Withdrawal must be in PENDING_APPROVAL or PENDING status, current: ${withdrawal.status}` },
          requestId: ctx.requestId,
        },
      };
    }

    const [existingAction] = await db
      .select()
      .from(pendingAdminActions)
      .where(and(
        eq(pendingAdminActions.targetType, "withdrawal"),
        eq(pendingAdminActions.targetId, withdrawalId),
        eq(pendingAdminActions.status, PendingActionStatus.PENDING)
      ))
      .limit(1);

    if (existingAction) {
      return {
        status: 409,
        body: {
          ok: false,
          error: { code: "ACTION_ALREADY_PENDING", message: "A pending approval request already exists" },
          requestId: ctx.requestId,
        },
      };
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const [created] = await db.insert(pendingAdminActions).values({
      actionType: "WITHDRAWAL_APPROVE",
      targetType: "withdrawal",
      targetId: withdrawalId,
      makerAdminUserId: adminUserId,
      payloadJson: { withdrawalId, requestedAt: new Date().toISOString() },
      expiresAt,
    }).returning();

    return {
      status: 201,
      body: {
        ok: true,
        data: {
          pendingActionId: created.id,
          status: "PENDING_APPROVAL",
          expiresAt: expiresAt.toISOString(),
        },
        requestId: ctx.requestId,
      },
      targetType: "withdrawal",
      targetId: withdrawalId,
      beforeJson: { status: withdrawal.status },
      afterJson: { status: withdrawal.status, pendingActionId: created.id },
    };
  })
);

adminRouter.post(
  "/pending-actions/:id/approve",
  requirePermission("withdrawals.approve"),
  requireIdempotencyKey,
  wrapMutation("PENDING_ACTION_APPROVE", async (req, _res, ctx) => {
    const actionId = req.params.id;
    const checkerAdminUserId = ctx.adminUserId;

    const [action] = await db
      .select()
      .from(pendingAdminActions)
      .where(eq(pendingAdminActions.id, actionId))
      .limit(1);

    if (!action) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Pending action not found" }, requestId: ctx.requestId },
      };
    }

    if (action.status !== PendingActionStatus.PENDING) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "ACTION_NOT_PENDING", message: `Action is not pending, status: ${action.status}` },
          requestId: ctx.requestId,
        },
      };
    }

    if (action.expiresAt && new Date() > action.expiresAt) {
      await db.update(pendingAdminActions)
        .set({ status: PendingActionStatus.EXPIRED })
        .where(eq(pendingAdminActions.id, actionId));

      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "ACTION_EXPIRED", message: "This pending action has expired" },
          requestId: ctx.requestId,
        },
      };
    }

    if (action.makerAdminUserId === checkerAdminUserId) {
      return {
        status: 403,
        body: {
          ok: false,
          error: { code: "SAME_USER_FORBIDDEN", message: "Maker and checker must be different users (4-eyes principle)" },
          requestId: ctx.requestId,
        },
      };
    }

    if (action.actionType === "WITHDRAWAL_APPROVE") {
      const [withdrawal] = await db
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.id, action.targetId))
        .limit(1);

      if (!withdrawal) {
        return {
          status: 404,
          body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Withdrawal not found" }, requestId: ctx.requestId },
        };
      }

      if (withdrawal.status !== "PENDING_APPROVAL" && withdrawal.status !== "PENDING") {
        return {
          status: 400,
          body: {
            ok: false,
            error: { code: "INVALID_STATUS", message: `Withdrawal must be in PENDING_APPROVAL or PENDING status, current: ${withdrawal.status}` },
            requestId: ctx.requestId,
          },
        };
      }

      if (withdrawal.reviewedByAdminId && withdrawal.reviewedByAdminId === checkerAdminUserId) {
        return {
          status: 403,
          body: {
            ok: false,
            error: { code: "SAME_USER_FORBIDDEN", message: "Reviewer and approver must be different users (4-eyes principle)" },
            requestId: ctx.requestId,
          },
        };
      }

      // Use transaction for atomicity
      const updated = await withTransaction(async (tx) => {
        await tx.update(pendingAdminActions)
          .set({
            status: PendingActionStatus.APPROVED,
            checkerAdminUserId,
            decisionAt: new Date(),
          })
          .where(eq(pendingAdminActions.id, actionId));

        const [updatedWithdrawal] = await tx.update(withdrawals)
          .set({
            status: "APPROVED",
            approvedBy: checkerAdminUserId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(withdrawals.id, action.targetId))
          .returning();

        // Sync operation status to approved (ready for processing)
        if (withdrawal.operationId) {
          await tx.update(operations)
            .set({
              status: "approved",
              updatedAt: new Date(),
            })
            .where(eq(operations.id, withdrawal.operationId));
        }

        await tx.update(adminInboxItems)
          .set({
            status: "DONE",
            resolvedAt: new Date(),
            resolvedByAdminUserId: checkerAdminUserId,
          })
          .where(and(
            eq(adminInboxItems.entityType, "withdrawal"),
            eq(adminInboxItems.entityId, action.targetId),
            eq(adminInboxItems.status, "OPEN")
          ));

        return updatedWithdrawal;
      });

      return {
        status: 200,
        body: {
          ok: true,
          data: { withdrawalId: updated.id, status: updated.status },
          requestId: ctx.requestId,
        },
        targetType: "withdrawal",
        targetId: updated.id,
        beforeJson: { status: withdrawal.status },
        afterJson: { status: "APPROVED", approvedBy: checkerAdminUserId },
      };
    }

    return {
      status: 400,
      body: {
        ok: false,
        error: { code: "UNSUPPORTED_ACTION", message: `Action type ${action.actionType} is not supported` },
        requestId: ctx.requestId,
      },
    };
  })
);

adminRouter.post(
  "/withdrawals/:id/reject",
  requirePermission("withdrawals.approve"),
  requireIdempotencyKey,
  wrapMutation("WITHDRAWAL_REJECT", async (req, _res, ctx) => {
    const withdrawalId = req.params.id;
    const adminUserId = ctx.adminUserId;

    const parsed = AdminWithdrawalDecisionBody.safeParse(req.body);
    if (!parsed.success || parsed.data.action !== "REJECT") {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "Invalid input - action must be REJECT" },
          requestId: ctx.requestId,
        },
      };
    }

    const { reason } = parsed.data;

    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Withdrawal not found" }, requestId: ctx.requestId },
      };
    }

    const allowedFrom = ["PENDING_REVIEW", "PENDING_APPROVAL", "PENDING"];
    if (!allowedFrom.includes(withdrawal.status)) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "INVALID_TRANSITION", message: `Cannot reject from status: ${withdrawal.status}` },
          requestId: ctx.requestId,
        },
      };
    }

    // Use transaction for atomicity: refund balance + update withdrawal + update operation
    const updated = await withTransaction(async (tx) => {
      // Cancel any pending admin actions
      await tx.update(pendingAdminActions)
        .set({ status: PendingActionStatus.CANCELLED })
        .where(and(
          eq(pendingAdminActions.targetType, "withdrawal"),
          eq(pendingAdminActions.targetId, withdrawalId),
          eq(pendingAdminActions.status, PendingActionStatus.PENDING)
        ));

      // Refund the balance to the user (amount + fee)
      const refundAmount = BigInt(withdrawal.amountMinor) + BigInt(withdrawal.feeMinor);
      const [currentBalance] = await tx.select().from(balances)
        .where(and(eq(balances.userId, withdrawal.userId), eq(balances.asset, withdrawal.currency)));
      
      if (currentBalance) {
        const newAvailable = BigInt(currentBalance.available) + refundAmount;
        await tx.update(balances)
          .set({ available: newAvailable.toString(), updatedAt: new Date() })
          .where(eq(balances.id, currentBalance.id));
      } else {
        // Create balance if doesn't exist (shouldn't happen, but be safe)
        await tx.insert(balances).values({
          userId: withdrawal.userId,
          asset: withdrawal.currency,
          available: refundAmount.toString(),
          locked: "0",
        });
      }

      // Update withdrawal status to REJECTED
      const [updatedWithdrawal] = await tx.update(withdrawals)
        .set({
          status: "REJECTED",
          rejectedBy: adminUserId,
          rejectedAt: new Date(),
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, withdrawalId))
        .returning();

      // Update linked operation status to cancelled
      if (withdrawal.operationId) {
        await tx.update(operations)
          .set({
            status: "cancelled",
            reason: `Withdrawal rejected: ${reason}`,
            updatedAt: new Date(),
          })
          .where(eq(operations.id, withdrawal.operationId));
      }

      // Create refund operation record
      await tx.insert(operations).values({
        userId: withdrawal.userId,
        type: "WITHDRAW_REFUND",
        status: "completed",
        asset: withdrawal.currency,
        amount: withdrawal.amountMinor,
        fee: "0",
        txHash: null,
        reason: `Refund for rejected withdrawal: ${reason}`,
        metadata: { 
          originalWithdrawalId: withdrawalId,
          originalOperationId: withdrawal.operationId,
          refundedAmount: withdrawal.amountMinor,
          refundedFee: withdrawal.feeMinor,
        },
      });

      // Update admin inbox items within transaction
      await tx.update(adminInboxItems)
        .set({
          status: "DONE",
          resolvedAt: new Date(),
          resolvedByAdminUserId: adminUserId,
        })
        .where(and(
          eq(adminInboxItems.entityType, "withdrawal"),
          eq(adminInboxItems.entityId, withdrawalId),
          eq(adminInboxItems.status, "OPEN")
        ));

      return updatedWithdrawal;
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: { withdrawalId: updated.id, status: updated.status, refunded: true },
        requestId: ctx.requestId,
      },
      targetType: "withdrawal",
      targetId: updated.id,
      beforeJson: { status: withdrawal.status },
      afterJson: { status: "REJECTED", rejectedBy: adminUserId, reason, refunded: true },
    };
  })
);

adminRouter.post(
  "/withdrawals/:id/process",
  requirePermission("withdrawals.manage"),
  requireIdempotencyKey,
  wrapMutation("WITHDRAWAL_PROCESS", async (req, _res, ctx) => {
    const withdrawalId = req.params.id;

    const parsed = AdminWithdrawalProcessBody.safeParse(req.body);
    if (!parsed.success) {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "Invalid input", details: parsed.error.issues },
          requestId: ctx.requestId,
        },
      };
    }

    const { action, reason, txHash, error } = parsed.data;

    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCodes.NOT_FOUND, message: "Withdrawal not found" }, requestId: ctx.requestId },
      };
    }

    let newStatus: string;
    let updates: Record<string, any> = { updatedAt: new Date() };

    if (action === "MARK_PROCESSING") {
      if (withdrawal.status !== "APPROVED") {
        return {
          status: 400,
          body: {
            ok: false,
            error: { code: "INVALID_TRANSITION", message: `Cannot mark processing from status: ${withdrawal.status}` },
            requestId: ctx.requestId,
          },
        };
      }
      newStatus = "PROCESSING";
      updates.status = newStatus;
      updates.processedAt = new Date();
      if (txHash) updates.txHash = txHash;
    } else if (action === "MARK_COMPLETED") {
      if (withdrawal.status !== "PROCESSING") {
        return {
          status: 400,
          body: {
            ok: false,
            error: { code: "INVALID_TRANSITION", message: `Cannot mark completed from status: ${withdrawal.status}` },
            requestId: ctx.requestId,
          },
        };
      }
      newStatus = "COMPLETED";
      updates.status = newStatus;
      updates.completedAt = new Date();
      if (txHash) updates.txHash = txHash;
    } else if (action === "MARK_FAILED") {
      if (withdrawal.status !== "PROCESSING") {
        return {
          status: 400,
          body: {
            ok: false,
            error: { code: "INVALID_TRANSITION", message: `Cannot mark failed from status: ${withdrawal.status}` },
            requestId: ctx.requestId,
          },
        };
      }
      newStatus = "FAILED";
      updates.status = newStatus;
      updates.lastError = error || reason;
    } else {
      return {
        status: 400,
        body: {
          ok: false,
          error: { code: "INVALID_ACTION", message: `Unknown action: ${action}` },
          requestId: ctx.requestId,
        },
      };
    }

    // Use transaction for atomicity
    const updated = await withTransaction(async (tx) => {
      const [updatedWithdrawal] = await tx.update(withdrawals)
        .set(updates)
        .where(eq(withdrawals.id, withdrawalId))
        .returning();

      // Sync operation status with withdrawal status
      if (withdrawal.operationId) {
        let opUpdates: Record<string, any> = { updatedAt: new Date() };
        
        if (action === "MARK_PROCESSING") {
          opUpdates.status = "processing";
          if (txHash) opUpdates.txHash = txHash;
        } else if (action === "MARK_COMPLETED") {
          opUpdates.status = "completed";
          if (txHash) opUpdates.txHash = txHash;
        } else if (action === "MARK_FAILED") {
          opUpdates.status = "failed";
          opUpdates.reason = error || reason || "Withdrawal processing failed";
        }
        
        await tx.update(operations)
          .set(opUpdates)
          .where(eq(operations.id, withdrawal.operationId));
      }

      return updatedWithdrawal;
    });

    return {
      status: 200,
      body: {
        ok: true,
        data: { withdrawalId: updated.id, status: updated.status, txHash: updated.txHash },
        requestId: ctx.requestId,
      },
      targetType: "withdrawal",
      targetId: updated.id,
      beforeJson: { status: withdrawal.status },
      afterJson: { status: newStatus, action, reason, txHash },
    };
  })
);
