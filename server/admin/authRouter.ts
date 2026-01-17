import { Router } from "express";
import { ensureRequestId } from "./middleware/requestId";
import { adminAuth } from "./middleware/adminAuth";
import { loadPermissions } from "./middleware/rbac";
import { ok, fail, ErrorCodes } from "./http";

export const adminAuthRouter = Router();

adminAuthRouter.use(ensureRequestId);

adminAuthRouter.get("/login", (req, res) => {
  res.redirect("/api/login");
});

adminAuthRouter.get("/logout", (req, res) => {
  res.redirect("/api/logout");
});

adminAuthRouter.get("/me", adminAuth, loadPermissions, async (req, res) => {
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
    console.error("[GET /admin/auth/me]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to get admin info", 500);
  }
});
