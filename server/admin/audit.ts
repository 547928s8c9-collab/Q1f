import { db } from "../db";
import { adminAuditLogs } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { fail, ErrorCodes } from "./http";
import crypto from "crypto";
import { logger } from "../lib/logger";

export interface AuditLogParams {
  actorAdminUserId: string;
  requestId?: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string;
  outcome: "success" | "failure" | "partial";
  errorCode?: string;
  ip?: string;
  userAgent?: string;
}

export async function logAdminAction(params: AuditLogParams): Promise<void> {
  try {
    await db.insert(adminAuditLogs).values({
      actorAdminUserId: params.actorAdminUserId,
      requestId: params.requestId || null,
      actionType: params.actionType,
      targetType: params.targetType || null,
      targetId: params.targetId || null,
      beforeJson: params.beforeJson || null,
      afterJson: params.afterJson || null,
      reason: params.reason || null,
      outcome: params.outcome,
      errorCode: params.errorCode || null,
      ip: params.ip || null,
      userAgent: params.userAgent || null,
    });
  } catch (error) {
    console.error("[logAdminAction] Failed to write audit log:", error);
  }
}

export interface IdempotencyResult {
  isDuplicate: boolean;
  cachedResponse?: { status: number; body: unknown };
  idempotencyKey?: string;
}

export async function checkAdminIdempotency(
  adminUserId: string,
  endpoint: string,
  idempotencyKey: string
): Promise<IdempotencyResult> {
  const { adminIdempotencyKeys } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");

  const [existing] = await db
    .select()
    .from(adminIdempotencyKeys)
    .where(
      and(
        eq(adminIdempotencyKeys.actorAdminUserId, adminUserId),
        eq(adminIdempotencyKeys.endpoint, endpoint),
        eq(adminIdempotencyKeys.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  if (existing) {
    if (existing.status === "completed" && existing.responseJson) {
      return {
        isDuplicate: true,
        cachedResponse: existing.responseJson as { status: number; body: unknown },
        idempotencyKey,
      };
    }
    return { isDuplicate: true, idempotencyKey };
  }

  try {
    await db.insert(adminIdempotencyKeys).values({
      actorAdminUserId: adminUserId,
      endpoint,
      idempotencyKey,
      status: "pending",
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return { isDuplicate: true, idempotencyKey };
    }
    throw err;
  }

  return { isDuplicate: false, idempotencyKey };
}

export async function completeAdminIdempotency(
  adminUserId: string,
  endpoint: string,
  idempotencyKey: string,
  status: "completed" | "failed",
  response: { status: number; body: unknown }
): Promise<void> {
  const { adminIdempotencyKeys } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");

  await db
    .update(adminIdempotencyKeys)
    .set({
      status,
      responseJson: response,
    })
    .where(
      and(
        eq(adminIdempotencyKeys.actorAdminUserId, adminUserId),
        eq(adminIdempotencyKeys.endpoint, endpoint),
        eq(adminIdempotencyKeys.idempotencyKey, idempotencyKey)
      )
    );
}

export function requireIdempotencyKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = req.headers["idempotency-key"];
  if (!key || typeof key !== "string" || key.length < 8) {
    fail(
      res,
      ErrorCodes.VALIDATION_ERROR,
      "Idempotency-Key header required (min 8 chars)",
      400
    );
    return;
  }
  res.locals.idempotencyKey = key;
  next();
}

type MutationResponseBody = {
  ok: boolean;
  requestId: string;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export function wrapMutation(
  actionType: string,
  handler: (
    req: Request,
    res: Response,
    context: {
      adminUserId: string;
      requestId: string;
      idempotencyKey: string;
      ip: string;
      userAgent: string;
    }
  ) => Promise<{ status: number; body: MutationResponseBody; targetType?: string; targetId?: string; beforeJson?: unknown; afterJson?: unknown; reason?: string }>
) {
  return async (req: Request, res: Response): Promise<void> => {
    const adminUserId = res.locals.adminUserId!;
    const requestId = res.locals.requestId || crypto.randomUUID();
    const idempotencyKey = res.locals.idempotencyKey!;
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";
    const endpoint = req.originalUrl.split("?")[0];

    try {
      const idempCheck = await checkAdminIdempotency(adminUserId, endpoint, idempotencyKey);
      if (idempCheck.isDuplicate) {
        if (idempCheck.cachedResponse) {
          res.status(idempCheck.cachedResponse.status).json(idempCheck.cachedResponse.body);
        } else {
          res.status(409).json({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT", message: "Request in progress" }, requestId });
        }
        return;
      }

      const result = await handler(req, res, { adminUserId, requestId, idempotencyKey, ip, userAgent });

      await completeAdminIdempotency(adminUserId, endpoint, idempotencyKey, "completed", {
        status: result.status,
        body: result.body,
      });

      await logAdminAction({
        actorAdminUserId: adminUserId,
        requestId,
        actionType,
        targetType: result.targetType,
        targetId: result.targetId,
        beforeJson: result.beforeJson,
        afterJson: result.afterJson,
        reason: result.reason,
        outcome: "success",
        ip,
        userAgent,
      });

      res.status(result.status).json(result.body);
    } catch (error: any) {
      logger.error(`wrapMutation:${actionType}`, "admin-audit", { actionType, adminUserId, requestId }, error);

      await completeAdminIdempotency(adminUserId, endpoint, idempotencyKey, "failed", {
        status: 500,
        body: { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" }, requestId },
      });

      await logAdminAction({
        actorAdminUserId: adminUserId,
        requestId,
        actionType,
        outcome: "failure",
        errorCode: error.code || "INTERNAL_ERROR",
        ip,
        userAgent,
      });

      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" }, requestId });
    }
  };
}
