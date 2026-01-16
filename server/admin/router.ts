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
} from "@shared/admin/dto";

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
