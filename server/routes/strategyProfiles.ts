import { storage } from "../storage";
import type { RouteDeps } from "./types";

export function registerStrategyProfilesRoutes({ app, isAuthenticated, devOnly }: RouteDeps): void {
  // GET /api/strategy-profiles
  app.get("/api/strategy-profiles", async (_req, res) => {
    try {
      const profiles = await storage.getStrategyProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Get strategy profiles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/strategy-profiles/seed - Seed strategy profiles (dev only)
  app.post("/api/strategy-profiles/seed", isAuthenticated, devOnly, async (_req, res) => {
    try {
      const result = await storage.seedStrategyProfiles();
      res.json({ success: true, message: "Strategy profiles seeded", ...result });
    } catch (error) {
      console.error("Seed strategy profiles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
