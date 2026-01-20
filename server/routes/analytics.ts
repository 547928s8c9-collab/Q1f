import type { RouteDeps } from "./types";
import { storage } from "../storage";
import { computeAnalyticsOverview } from "../services/portfolioAnalytics";

export function registerAnalyticsRoutes(deps: RouteDeps): void {
  const { app, isAuthenticated, getUserId } = deps;

  // GET /api/analytics/overview - Investor analytics summary
  app.get("/api/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const days = 30;

      // Parallel fetch all required data
      const [balances, vaults, positions, portfolioSeries, allStrategies] = await Promise.all([
        storage.getBalances(userId),
        storage.getVaults(userId),
        storage.getPositions(userId),
        storage.getPortfolioSeries(userId, days),
        storage.getStrategies(),
      ]);

      const overview = computeAnalyticsOverview({
        balances,
        vaults,
        positions,
        portfolioSeries,
        strategies: allStrategies,
      });

      res.json({
        updatedAt: new Date().toISOString(),
        ...overview,
      });
    } catch (error) {
      console.error("Analytics overview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
