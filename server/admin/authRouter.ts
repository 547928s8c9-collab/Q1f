import { Router } from "express";
import { ensureRequestId } from "./middleware/requestId";
import { adminAuth } from "./middleware/adminAuth";
import { loadPermissions } from "./middleware/rbac";
import { logAdminAction } from "./audit";
import { ok, fail, ErrorCodes } from "./http";

export const adminAuthRouter = Router();

adminAuthRouter.use(ensureRequestId);

adminAuthRouter.get("/login", (req, res) => {
  res.redirect("/api/login");
});

adminAuthRouter.get("/logout", adminAuth, loadPermissions, async (req, res) => {
  const adminUserId = res.locals.adminUserId!;
  const requestId = res.locals.requestId as string | undefined;
  const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  await logAdminAction({
    actorAdminUserId: adminUserId,
    requestId,
    actionType: "admin.auth.logout",
    outcome: "success",
    ip,
    userAgent,
  });
  res.redirect("/api/logout");
});

adminAuthRouter.get("/me", adminAuth, loadPermissions, async (req, res) => {
  try {
    const adminUserId = res.locals.adminUserId!;
    const userId = res.locals.userId!;
    const email = res.locals.email!;
    const roles = res.locals.roleKeys || [];
    const permissions = Array.from(res.locals.permissionKeys || []);
    const requestId = res.locals.requestId as string | undefined;
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    ok(res, {
      adminUserId,
      userId,
      email,
      roles,
      permissions,
    });

    await logAdminAction({
      actorAdminUserId: adminUserId,
      requestId,
      actionType: "admin.auth.login",
      outcome: "success",
      ip,
      userAgent,
    });
  } catch (error) {
    console.error("[GET /admin/auth/me]", error);
    fail(res, ErrorCodes.INTERNAL_ERROR, "Failed to get admin info", 500);
  }
});
