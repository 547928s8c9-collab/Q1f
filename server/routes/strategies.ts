import { storage } from "../storage";
import type { StrategyPerformance } from "@shared/schema";
import type { RouteDeps } from "./types";

export function registerStrategiesRoutes({ app, isAuthenticated, devOnly }: RouteDeps): void {
  // GET /api/strategies
  app.get("/api/strategies", async (req, res) => {
    try {
      const strategies = await storage.getStrategies();
      res.json(strategies);
    } catch (error) {
      console.error("Get strategies error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/performance-all - Get performance data for all strategies (for sparklines)
  // NOTE: Must be defined BEFORE /api/strategies/:id to avoid route conflict
  app.get("/api/strategies/performance-all", async (req, res) => {
    try {
      const strategies = await storage.getStrategies();
      
      // Parallel fetch performance for all strategies
      const perfList = await Promise.all(
        strategies.map(s => storage.getStrategyPerformance(s.id, 30))
      );
      
      const result: Record<string, StrategyPerformance[]> = {};
      strategies.forEach((strategy, i) => {
        result[strategy.id] = perfList[i];
      });
      
      res.json(result);
    } catch (error) {
      console.error("Get all strategy performance error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/:id
  app.get("/api/strategies/:id", async (req, res) => {
    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }
      res.json(strategy);
    } catch (error) {
      console.error("Get strategy error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/:id/series
  app.get("/api/strategies/:id/series", async (req, res) => {
    try {
      const series = await storage.getStrategySeries(req.params.id, 90);
      res.json(series);
    } catch (error) {
      console.error("Get strategy series error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/:id/performance - Get strategy performance with benchmarks
  app.get("/api/strategies/:id/performance", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 90;
      const performance = await storage.getStrategyPerformance(req.params.id, days);
      res.json(performance);
    } catch (error) {
      console.error("Get strategy performance error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/strategies/seed - Seed strategies (dev only)
  app.post("/api/strategies/seed", isAuthenticated, devOnly, async (req, res) => {
    try {
      const result = await storage.seedStrategies();
      res.json({ success: true, message: "Strategies seeded", ...result });
    } catch (error) {
      console.error("Seed strategies error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
