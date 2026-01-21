import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";
import { db } from "../../db";
import { adminUsers, adminUserRoles, roles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { seedAdminDemoData } from "../../admin/demoSeed";

const DEMO_USER_ID = "demo-user-001";
const DEMO_ADMIN_USER_ID = "demo-admin-001";
const DEMO_ADMIN_EMAIL = "demo-admin@local";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Demo login - creates a demo session for preview purposes
  app.get("/api/demo-login", async (req: any, res) => {
    try {
      // Check if demo user exists, create if not
      let user = await authStorage.getUser(DEMO_USER_ID);
      if (!user) {
        user = await authStorage.upsertUser({
          id: DEMO_USER_ID,
          email: "demo@example.com",
          firstName: "Demo",
          lastName: "User",
          profileImageUrl: null,
        });
      }

      // Initialize demo user data (balances, vaults, security settings)
      await storage.ensureUserData(DEMO_USER_ID);

      // Seed historical demo data (positions, operations, portfolio series)
      await storage.seedDemoUserData(DEMO_USER_ID);

      // Set demo user as fully onboarded with demo balances
      await storage.updateSecuritySettings(DEMO_USER_ID, {
        contactVerified: true,
        consentAccepted: true,
        kycStatus: "approved",
        twoFactorEnabled: false,
        whitelistEnabled: false,
      });

      // Create approved KYC applicant record for demo user
      await storage.upsertKycApplicant(DEMO_USER_ID, {
        status: "APPROVED",
        level: "BASIC",
        reviewedAt: new Date(),
      });

      // Add some demo balance for the user to explore
      await storage.updateBalance(DEMO_USER_ID, "USDT", "10000000000", "0"); // 10,000 USDT
      await storage.updateBalance(DEMO_USER_ID, "RUB", "50000000", "0"); // 500,000 RUB

      // Create demo user object matching passport format
      // expires_at is required by isAuthenticated middleware
      const demoUser = {
        claims: {
          sub: DEMO_USER_ID,
          email: "demo@example.com",
          first_name: "Demo",
          last_name: "User",
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 1 week from now
      };

      // Use passport's login method for proper session handling
      req.login(demoUser, (err: any) => {
        if (err) {
          console.error("Demo login error:", err);
          return res.status(500).json({ error: "Failed to create demo session" });
        }
        // Ensure session is saved before redirect
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ error: "Failed to save session" });
          }
          console.log("Demo login successful, session saved for user:", DEMO_USER_ID);
          res.redirect("/");
        });
      });
    } catch (error) {
      console.error("Demo login error:", error);
      res.status(500).json({ error: "Failed to create demo session" });
    }
  });

  // Get current authenticated user
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Demo Admin Login - creates a demo admin session with super_admin role (dev-only)
  app.post("/api/admin/auth/demo", async (req: any, res) => {
    try {
      // Guard: only in dev mode with ALLOW_DEMO_ENDPOINTS=true
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Demo admin login is not available in production",
          },
        });
      }

      if (process.env.ALLOW_DEMO_ENDPOINTS !== "true") {
        return res.status(403).json({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Demo endpoints are disabled. Set ALLOW_DEMO_ENDPOINTS=true to enable.",
          },
        });
      }

      // Ensure RBAC is seeded
      await storage.seedAdminRbac();

      // Find or create demo admin user
      let user = await authStorage.getUser(DEMO_ADMIN_USER_ID);
      if (!user) {
        user = await authStorage.upsertUser({
          id: DEMO_ADMIN_USER_ID,
          email: DEMO_ADMIN_EMAIL,
          firstName: "Demo",
          lastName: "Admin",
          profileImageUrl: null,
        });
      }

      // Initialize user data and set as fully onboarded
      await storage.ensureUserData(DEMO_ADMIN_USER_ID);
      await storage.updateSecuritySettings(DEMO_ADMIN_USER_ID, {
        contactVerified: true,
        consentAccepted: true,
        kycStatus: "approved",
        twoFactorEnabled: false,
        whitelistEnabled: false,
      });
      
      // Create approved KYC applicant record for demo admin
      await storage.upsertKycApplicant(DEMO_ADMIN_USER_ID, {
        status: "APPROVED",
        level: "BASIC",
        reviewedAt: new Date(),
      });

      // Find or create admin_users entry
      let [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.userId, DEMO_ADMIN_USER_ID))
        .limit(1);

      if (!admin) {
        const [created] = await db
          .insert(adminUsers)
          .values({
            userId: DEMO_ADMIN_USER_ID,
            email: DEMO_ADMIN_EMAIL,
            isActive: true,
          })
          .returning();
        admin = created;
      } else if (!admin.isActive) {
        await db
          .update(adminUsers)
          .set({ isActive: true, email: DEMO_ADMIN_EMAIL })
          .where(eq(adminUsers.id, admin.id));
      }

      // Find super_admin role
      const [superAdminRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.key, "super_admin"))
        .limit(1);

      if (!superAdminRole) {
        return res.status(500).json({
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Super admin role not found. RBAC seed may have failed.",
          },
        });
      }

      // Assign super_admin role if not already assigned
      const [existingRole] = await db
        .select()
        .from(adminUserRoles)
        .where(
          and(
            eq(adminUserRoles.adminUserId, admin.id),
            eq(adminUserRoles.roleId, superAdminRole.id)
          )
        )
        .limit(1);

      if (!existingRole) {
        await db.insert(adminUserRoles).values({
          adminUserId: admin.id,
          roleId: superAdminRole.id,
        });
      }

      // Create demo admin user object matching passport format
      const demoAdminUser = {
        claims: {
          sub: DEMO_ADMIN_USER_ID,
          email: DEMO_ADMIN_EMAIL,
          first_name: "Demo",
          last_name: "Admin",
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 1 week from now
      };

      // Use passport's login method for proper session handling
      req.login(demoAdminUser, (err: any) => {
        if (err) {
          console.error("Demo admin login error:", err);
          return res.status(500).json({
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Failed to create demo admin session",
            },
          });
        }
        // Ensure session is saved before responding
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({
              ok: false,
              error: {
                code: "INTERNAL_ERROR",
                message: "Failed to save session",
              },
            });
          }
          console.log("Demo admin login successful, session saved for user:", DEMO_ADMIN_USER_ID);
          
          // Seed demo data if not already seeded (fire and forget)
          seedAdminDemoData({ adminUserId: admin.id }).catch((err) => {
            console.error("Failed to seed demo data:", err);
          });
          
          res.json({
            ok: true,
            data: {
              redirectTo: "/admin",
            },
          });
        });
      });
    } catch (error) {
      console.error("Demo admin login error:", error);
      res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create demo admin session",
        },
      });
    }
  });
}
