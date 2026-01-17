import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { adminUsers, adminUserRoles, roles, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    adminId?: string;
  }
}

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin login attempts, please try again later" },
  validate: { xForwardedForHeader: false },
});

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", loginLimiter, async (req, res) => {
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const bootstrapHash = process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH;

  if (!bootstrapEmail || !bootstrapHash) {
    return res.status(500).json({
      error: "Admin bootstrap credentials not configured",
    });
  }

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
  }

  const { email, password } = parsed.data;
  if (email !== bootstrapEmail) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, bootstrapHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    const [created] = await db.insert(users).values({ email }).returning();
    user = created;
  }

  const [admin] = await db
    .insert(adminUsers)
    .values({
      userId: user.id,
      email,
      isActive: true,
      isSuperAdmin: true,
    })
    .onConflictDoUpdate({
      target: adminUsers.userId,
      set: {
        email,
        isActive: true,
        isSuperAdmin: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [superAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.key, "super_admin"))
    .limit(1);

  if (superAdminRole) {
    await db
      .insert(adminUserRoles)
      .values({
        adminUserId: admin.id,
        roleId: superAdminRole.id,
      })
      .onConflictDoNothing();
  }

  req.session.adminId = admin.id;
  req.session.save(() => {
    res.json({ ok: true });
  });
});

adminAuthRouter.get("/me", async (req, res) => {
  const adminId = req.session.adminId;
  if (!adminId) {
    return res.json({ ok: false });
  }

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.id, adminId), eq(adminUsers.isActive, true)))
    .limit(1);

  if (!admin) {
    return res.json({ ok: false });
  }

  res.json({
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      isSuperAdmin: admin.isSuperAdmin === true,
    },
  });
});

adminAuthRouter.post("/logout", (req, res) => {
  delete req.session.adminId;
  req.session.save(() => {
    res.json({ ok: true });
  });
});
