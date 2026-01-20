import { storage } from "../storage";
import { db } from "../db";
import { eq, and, gte, desc, sql, inArray } from "drizzle-orm";
import { simEquitySnapshots, simTrades, simPositions, investState, positions } from "@shared/schema";
import type { StrategyPerformance } from "@shared/schema";
import type { RouteDeps } from "./types";
import { logger } from "../lib/logger";

export interface LiveStrategyMetrics {
  strategyId: string;
  profileSlug: string | null;
  symbol: string | null;
  timeframe: string | null;
  equityMinor: string;
  pnlMinor: string;
  roi30dBps: number;
  maxDrawdown30dBps: number;
  trades24h: number;
  state: string;
  updatedAt: string | null;
}

export function registerStrategiesRoutes({ app, isAuthenticated, devOnly, getUserId }: RouteDeps): void {
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

  // GET /api/strategies/live-metrics - Get live metrics for all user strategies
  app.get("/api/strategies/live-metrics", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      // Get all user positions
      const userPositions = await storage.getPositions(userId);

      if (userPositions.length === 0) {
        return res.json([]);
      }

      const strategyIds = userPositions.map((p) => p.strategyId);

      // Get simPositions for profileSlug, symbol, timeframe
      const simPos = await db
        .select()
        .from(simPositions)
        .where(and(eq(simPositions.userId, userId), inArray(simPositions.strategyId, strategyIds)));

      const simPosMap = new Map(simPos.map((p) => [p.strategyId, p]));

      // Get invest states
      const states = await db
        .select()
        .from(investState)
        .where(and(eq(investState.userId, userId), inArray(investState.strategyId, strategyIds)));

      const stateMap = new Map(states.map((s) => [s.strategyId, s.state]));

      // Get equity snapshots for last 30 days (limit to 5000 total for performance)
      const snapshots = await db
        .select()
        .from(simEquitySnapshots)
        .where(
          and(
            eq(simEquitySnapshots.userId, userId),
            inArray(simEquitySnapshots.strategyId, strategyIds),
            gte(simEquitySnapshots.ts, thirtyDaysAgo)
          )
        )
        .orderBy(desc(simEquitySnapshots.ts))
        .limit(5000); // Limit total snapshots for performance

      // Group snapshots by strategyId
      const snapshotsByStrategy = new Map<string, typeof snapshots>();
      for (const snapshot of snapshots) {
        if (!snapshotsByStrategy.has(snapshot.strategyId)) {
          snapshotsByStrategy.set(snapshot.strategyId, []);
        }
        snapshotsByStrategy.get(snapshot.strategyId)!.push(snapshot);
      }

      // Get trades count for last 24 hours
      const trades24h = await db
        .select({
          strategyId: simTrades.strategyId,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(simTrades)
        .where(
          and(
            eq(simTrades.userId, userId),
            inArray(simTrades.strategyId, strategyIds),
            gte(simTrades.entryTs, twentyFourHoursAgo)
          )
        )
        .groupBy(simTrades.strategyId);

      const trades24hMap = new Map(trades24h.map((t) => [t.strategyId, t.count]));

      // Build metrics for each position
      const metrics: LiveStrategyMetrics[] = userPositions.map((position) => {
        const simPosData = simPosMap.get(position.strategyId);
        const strategySnapshots = snapshotsByStrategy.get(position.strategyId) || [];
        const tradesCount = trades24hMap.get(position.strategyId) || 0;
        const state = stateMap.get(position.strategyId) || "NOT_INVESTED";

        // Calculate equityMinor and pnlMinor from position
        const equityMinor = position.investedCurrentMinor || "0";
        const principalMinor = BigInt(position.principalMinor || "0");
        const equity = BigInt(equityMinor);
        const pnlMinor = (equity - principalMinor).toString();

        // Calculate roi30dBps and maxDrawdown30dBps from snapshots
        let roi30dBps = 0;
        let maxDrawdown30dBps = 0;

        if (strategySnapshots.length >= 2) {
          // Sort by timestamp ascending
          const sortedSnapshots = [...strategySnapshots].sort((a, b) => a.ts - b.ts);
          const firstSnapshot = sortedSnapshots[0];
          const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];

          const firstEquity = BigInt(firstSnapshot.equityMinor || "0");
          const lastEquity = BigInt(lastSnapshot.equityMinor || "0");

          if (firstEquity > 0n) {
            const roiPct = Number(lastEquity - firstEquity) / Number(firstEquity);
            roi30dBps = Math.round(roiPct * 10000); // Convert to basis points
          }

          // Calculate max drawdown
          let peak = BigInt(0);
          let maxDrawdown = 0;

          for (const snapshot of sortedSnapshots) {
            const equity = BigInt(snapshot.equityMinor || "0");
            if (equity > peak) {
              peak = equity;
            }
            if (peak > 0n) {
              const drawdown = Number(peak - equity) / Number(peak);
              if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
              }
            }
          }

          maxDrawdown30dBps = Math.round(maxDrawdown * 10000); // Convert to basis points
        }

        // Get updatedAt from position or last snapshot
        let updatedAt: string | null = position.updatedAt?.toISOString() || null;
        if (!updatedAt && strategySnapshots.length > 0) {
          const lastSnapshot = strategySnapshots[0]; // Already sorted desc
          updatedAt = lastSnapshot.createdAt?.toISOString() || null;
        }

        return {
          strategyId: position.strategyId,
          profileSlug: simPosData?.profileSlug || null,
          symbol: simPosData?.symbol || null,
          timeframe: simPosData?.timeframe || null,
          equityMinor,
          pnlMinor,
          roi30dBps,
          maxDrawdown30dBps,
          trades24h: tradesCount,
          state,
          updatedAt,
        };
      });

      res.json(metrics);
    } catch (error) {
      logger.error("Get live metrics error", "strategies-routes", {}, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
