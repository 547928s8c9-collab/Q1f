import type { Request, Response, NextFunction } from "express";
import { fail, ErrorCodes } from "../http";
import { db } from "../../db";
import { adminUsers, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface AdminLocals {
  requestId: string;
  adminUserId: string;
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Locals extends Partial<AdminLocals> {}
  }
}

const isDev = process.env.NODE_ENV !== "production";
const allowDevAdminHeader = isDev && process.env.ALLOW_DEV_ADMIN_HEADER === "true";
let warnedDevHeader = false;

function warnDevHeaderDenied(): void {
  if (warnedDevHeader) return;
  warnedDevHeader = true;
  console.warn("[adminAuth] x-replit-user-id header ignored (ALLOW_DEV_ADMIN_HEADER not enabled)");
}

function extractUserId(req: Request): string | undefined {
  const userClaims = (req.user as any)?.claims;
  if (userClaims?.sub) {
    return userClaims.sub;
  }
  const devHeader = req.headers["x-replit-user-id"] as string | undefined;
  if (devHeader) {
    if (allowDevAdminHeader) {
      return devHeader;
    }
    warnDevHeaderDenied();
  }
  return undefined;
}

export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const oidcUserId = extractUserId(req);

    if (!oidcUserId) {
      fail(res, ErrorCodes.AUTH_REQUIRED, "Authentication required", 401);
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, oidcUserId))
      .limit(1);

    if (!user) {
      fail(res, ErrorCodes.AUTH_REQUIRED, "Authentication required", 401);
      return;
    }

    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.userId, oidcUserId), eq(adminUsers.isActive, true)))
      .limit(1);

    if (!admin) {
      fail(res, ErrorCodes.ADMIN_REQUIRED, "Admin access required", 403);
      return;
    }

    res.locals.adminUserId = admin.id;
    res.locals.userId = oidcUserId;
    res.locals.email = admin.email || user.email || "";

    next();
  } catch (error) {
    console.error("[adminAuth] Error:", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Authentication failed", 500);
  }
}
