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

interface CachedPermissions {
  permissionKeys: Set<string>;
  roleKeys: string[];
  expiresAt: number;
}

const permissionsCache = new Map<string, CachedPermissions>();
const CACHE_TTL_MS = 60_000;

function getCachedPermissions(adminUserId: string): CachedPermissions | null {
  const cached = permissionsCache.get(adminUserId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    permissionsCache.delete(adminUserId);
    return null;
  }
  return cached;
}

function setCachedPermissions(
  adminUserId: string,
  permissionKeys: Set<string>,
  roleKeys: string[]
): void {
  permissionsCache.set(adminUserId, {
    permissionKeys,
    roleKeys,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function invalidatePermissionsCache(adminUserId?: string): void {
  if (adminUserId) {
    permissionsCache.delete(adminUserId);
  } else {
    permissionsCache.clear();
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

    const cached = getCachedPermissions(adminUserId);
    if (cached) {
      res.locals.permissionKeys = cached.permissionKeys;
      res.locals.roleKeys = cached.roleKeys;
      next();
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
      setCachedPermissions(adminUserId, new Set(), []);
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
      const roleKeysList = rolesData.map((r) => r.key);
      res.locals.permissionKeys = new Set();
      res.locals.roleKeys = roleKeysList;
      setCachedPermissions(adminUserId, new Set(), roleKeysList);
      next();
      return;
    }

    const permsData = await db
      .select({ key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.id, permIds));

    const permissionKeys = new Set(permsData.map((p) => p.key));
    const roleKeysList = rolesData.map((r) => r.key);

    res.locals.permissionKeys = permissionKeys;
    res.locals.roleKeys = roleKeysList;
    setCachedPermissions(adminUserId, permissionKeys, roleKeysList);

    next();
  } catch (error) {
    console.error("[loadPermissions] Error:", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to load permissions", 500);
  }
}

export function requirePermission(...requiredPerms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (res.locals.isSuperAdmin) {
      next();
      return;
    }

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
