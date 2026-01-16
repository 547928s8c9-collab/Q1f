import { Router } from "express";
import { ensureRequestId } from "./middleware/requestId";
import { adminAuth } from "./middleware/adminAuth";
import { loadPermissions, requirePermission } from "./middleware/rbac";
import { ok, fail, ErrorCodes } from "./http";
import { db } from "../db";
import {
  users,
  kycApplicants,
  balances,
  operations,
  securitySettings,
  adminInboxItems,
  incidents,
} from "@shared/schema";
import { eq, desc, and, lt, or, ilike } from "drizzle-orm";
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
} from "@shared/admin/dto";
import { requireIdempotencyKey, wrapMutation } from "./audit";

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
              code: "INVALID_TRANSITION",
              message: `Cannot transition from ${existing.status} to ${input.status}`,
              allowedTransitions,
            },
            requestId: ctx.requestId,
          },
        };
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
