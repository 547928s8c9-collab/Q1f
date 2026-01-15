import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";

const DEMO_USER_ID = "demo-user-001";

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

      // Set demo user as fully onboarded with demo balances
      await storage.updateSecuritySettings(DEMO_USER_ID, {
        contactVerified: true,
        consentAccepted: true,
        kycStatus: "approved",
        twoFactorEnabled: false,
        whitelistEnabled: false,
      });

      // Add some demo balance for the user to explore
      await storage.updateBalance(DEMO_USER_ID, "USDT", "10000000000", "0"); // 10,000 USDT
      await storage.updateBalance(DEMO_USER_ID, "RUB", "50000000", "0"); // 500,000 RUB

      // Set up demo session
      req.user = {
        claims: {
          sub: DEMO_USER_ID,
          email: "demo@example.com",
          first_name: "Demo",
          last_name: "User",
        },
      };

      // Save to session
      req.session.passport = { user: req.user };
      req.session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Failed to create demo session" });
        }
        res.redirect("/");
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
}
