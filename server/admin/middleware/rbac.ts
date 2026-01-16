import type { Request, Response, NextFunction } from "express";
import { fail, ErrorCodes } from "../http";
import { db } from "../../db";
import {
  adminUserRoles,
  rolePermissions,
  permissions,
  roles,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

export interface RbacLocals {
  permissionKeys: Set<string>;
  roleKeys: string[];
}

declare global {
  namespace Express {
    interface Locals extends Partial<RbacLocals> {}
  }
}

export async function loadPermissions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminUserId = res.locals.adminUserId as string | undefined;
    if (!adminUserId) {
      fail(res, ErrorCodes.ADMIN_REQUIRED, "Admin context missing", 401);
      return;
    }

    const userRoles = await db
      .select({ roleId: adminUserRoles.roleId })
      .from(adminUserRoles)
      .where(eq(adminUserRoles.adminUserId, adminUserId as string));

    const roleIds = userRoles.map((r) => r.roleId);

    if (roleIds.length === 0) {
      res.locals.permissionKeys = new Set();
      res.locals.roleKeys = [];
      next();
      return;
    }

    const rolesData = await db
      .select({ key: roles.key })
      .from(roles)
      .where(inArray(roles.id, roleIds));

    const rolePerms = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleId, roleIds));

    const permIds = rolePerms.map((rp) => rp.permissionId);

    if (permIds.length === 0) {
      res.locals.permissionKeys = new Set();
      res.locals.roleKeys = rolesData.map((r) => r.key);
      next();
      return;
    }

    const permsData = await db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.id, permIds));

    res.locals.permissionKeys = new Set(permsData.map((p) => p.key));
    res.locals.roleKeys = rolesData.map((r) => r.key);

    next();
  } catch (error) {
    console.error("[loadPermissions] Error:", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to load permissions", 500);
  }
}

export function requirePermission(...requiredPerms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const perms = res.locals.permissionKeys;

    if (!perms) {
      fail(res, ErrorCodes.RBAC_DENIED, "Permissions not loaded", 403);
      return;
    }

    const missing = requiredPerms.filter((p) => !perms.has(p));
    if (missing.length > 0) {
      fail(
        res,
        ErrorCodes.RBAC_DENIED,
        `Missing permissions: ${missing.join(", ")}`,
        403
      );
      return;
    }

    next();
  };
}
