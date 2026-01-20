import type { InvestMetrics, SimAllocation } from "@shared/schema";
import type { RouteDeps } from "./types";
import { logger } from "../lib/logger";
import rateLimit from "express-rate-limit";
import type { Request } from "express";
import {
  InvestCandlesQuerySchema,
  InvestMutationSchema,
  InvestTradesQuerySchema,
  WithdrawMutationSchema,
} from "@shared/contracts/invest";
import { storage } from "../storage";
import { normalizeTimeframe } from "../marketData/utils";
import { simulateInvestStrategy } from "../strategies/investSimulation";
import type { StrategyConfig, StrategyProfileSlug } from "../strategies/types";
import { getMarketCandles } from "../app/marketDataService";
import { getStrategyById, listStrategies } from "../app/strategyRegistry";
import { InvestStates, transitionState, type InvestState } from "../domain/investStateMachine";
import { withTransaction, db } from "../db";
import { balances, simAllocations, investState } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { registerEngineLoop } from "../app/engineInit";

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 180;
const DAY_MS = 86_400_000;

// Rate limiter for invest/withdraw operations: 10 requests per minute per user/IP
const investRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json(fail("RATE_LIMITED", "Too many invest/withdraw requests. Please try again in a minute."));
  },
});

const emptyMetrics: InvestMetrics = {
  totalTrades: 0,
  winRatePct: 0,
  netPnl: 0,
  netPnlPct: 0,
  grossPnl: 0,
  fees: 0,
  avgHoldBars: 0,
  profitFactor: 0,
  avgTradePnl: 0,
};

function parsePeriodDays(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_PERIOD_DAYS;
  if (Number.isNaN(parsed)) return DEFAULT_PERIOD_DAYS;
  return Math.min(Math.max(parsed, MIN_PERIOD_DAYS), MAX_PERIOD_DAYS);
}

function ok<T>(data: T) {
  return { ok: true, data };
}

function fail(code: string, message: string, details?: unknown) {
  return { ok: false, error: { code, message, details } };
}

async function resolveProfile(strategyId: string): Promise<{ strategy: { id: string; name: string; expectedReturnMinBps?: number | null; expectedReturnMaxBps?: number | null }; profile: { slug: string; symbol: string; timeframe: string; defaultConfig: StrategyConfig } } | null> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) return null;

  const profiles = await storage.getStrategyProfiles();
  const profile = profiles.find((item) => item.displayName === strategy.name);

  if (!profile) return null;

  return {
    strategy: {
      id: strategy.id,
      name: strategy.name,
      expectedReturnMinBps: strategy.expectedMonthlyRangeBpsMin,
      expectedReturnMaxBps: strategy.expectedMonthlyRangeBpsMax,
    },
    profile: {
      slug: profile.slug,
      symbol: profile.symbol,
      timeframe: profile.timeframe,
      defaultConfig: profile.defaultConfig as StrategyConfig,
    },
  };
}

export function registerInvestRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  app.get("/api/invest/strategies", async (_req, res) => {
    try {
      const strategies = await listStrategies();
      res.json(ok({ strategies }));
    } catch (error) {
      logger.error("Invest strategies error", "invest-routes", {}, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/overview", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const summary = await getStrategyById(req.params.id);
      if (!summary) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const [state, snapshot] = await Promise.all([
        storage.getInvestState(userId, summary.id),
        storage.getLatestSimEquitySnapshot(userId, summary.id),
      ]);

      res.json(ok({
        strategy: summary,
        state: state?.state ?? InvestStates.NOT_INVESTED,
        equityMinor: snapshot?.equityMinor ?? null,
        allocatedMinor: snapshot?.allocatedMinor ?? null,
        pnlMinor: snapshot?.pnlCumMinor ?? null,
        lastSnapshotTs: snapshot?.ts ?? null,
      }));
    } catch (error) {
      logger.error("Invest overview error", "invest-routes", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/candles", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    try {
      const query = InvestCandlesQuerySchema.safeParse(req.query);
      if (!query.success) {
        return res.status(400).json(fail("INVALID_QUERY", "Invalid query", query.error.flatten()));
      }

      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const { profile } = resolved;
      const periodDays = parsePeriodDays(query.data.periodDays?.toString());
      const timeframe = normalizeTimeframe(query.data.timeframe ?? profile.timeframe);

      const endMs = query.data.endMs ?? Date.now();
      const startMs = query.data.startMs ?? endMs - periodDays * DAY_MS;
      const maxCandles = Math.min(query.data.limit ?? 1500, 5000);

      const result = await getMarketCandles({
        exchange: "synthetic",
        symbol: profile.symbol,
        timeframe,
        fromTs: startMs,
        toTs: endMs,
        userId,
        strategyId: resolved.strategy.id,
        maxCandles,
      });

      res.json(ok({
        ...result,
        symbol: profile.symbol,
        timeframe,
        periodDays,
      }));
    } catch (error) {
      logger.error("Invest candles error", "invest-routes", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/insights", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    try {
      const query = InvestTradesQuerySchema.safeParse(req.query);
      if (!query.success) {
        return res.status(400).json(fail("INVALID_QUERY", "Invalid query", query.error.flatten()));
      }

      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const { profile } = resolved;
      const periodDays = parsePeriodDays(query.data.periodDays?.toString());
      const timeframe = normalizeTimeframe(query.data.timeframe ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      const result = await getMarketCandles({
        exchange: "synthetic",
        symbol: profile.symbol,
        timeframe,
        fromTs: startMs,
        toTs: endMs,
        userId,
        strategyId: resolved.strategy.id,
        maxCandles: 2000,
      });

      if (result.candles.length === 0) {
        return res.json(ok({
          trades: [],
          metrics: emptyMetrics,
          timeframe,
          periodDays,
          symbol: profile.symbol,
        }));
      }

      const config = profile.defaultConfig as StrategyConfig;
      const { trades, metrics } = simulateInvestStrategy({
        candles: result.candles,
        profileSlug: profile.slug as StrategyProfileSlug,
        config,
        meta: {
          symbol: profile.symbol,
          timeframe,
        },
      });

      res.json(ok({
        trades,
        metrics,
        timeframe,
        periodDays,
        symbol: profile.symbol,
      }));
    } catch (error) {
      logger.error("Invest insights error", "invest-routes", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/trades", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    try {
      const query = InvestTradesQuerySchema.safeParse(req.query);
      if (!query.success) {
        return res.status(400).json(fail("INVALID_QUERY", "Invalid query", query.error.flatten()));
      }

      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const periodDays = query.data.periodDays ?? DEFAULT_PERIOD_DAYS;
      const limit = Math.min(query.data.limit ?? 100, 1000); // Cap at 1000
      const cursor = query.data.cursor;
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      // Get real trades from database with pagination
      const result = await storage.getSimTrades(
        userId,
        resolved.strategy.id,
        startMs,
        endMs,
        limit,
        cursor
      );

      // Transform SimTrade to API format
      const trades = result.trades.map((trade) => ({
        id: trade.id,
        entryTs: trade.entryTs ?? 0,
        exitTs: trade.exitTs ?? 0,
        entryPrice: parseFloat(trade.entryPrice || "0"),
        exitPrice: parseFloat(trade.exitPrice || "0"),
        qty: parseFloat(trade.qty || "0"),
        netPnl: parseFloat(trade.netPnlMinor || "0") / 1_000_000, // Convert from minor units
        netPnlPct: trade.entryPrice && parseFloat(trade.entryPrice) > 0
          ? ((parseFloat(trade.exitPrice || "0") - parseFloat(trade.entryPrice)) / parseFloat(trade.entryPrice)) * 100
          : 0,
        holdBars: trade.holdBars ?? 0,
        reason: trade.reason || "",
      }));

      res.json(ok({ trades, nextCursor: result.nextCursor }));
    } catch (error) {
      logger.error("Invest trades error", "invest-routes", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  // GET /api/invest/strategies/:id/trade-events - Get events for a specific trade
  app.get("/api/invest/strategies/:id/trade-events", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    try {
      const tradeId = req.query.tradeId as string;
      if (!tradeId) {
        return res.status(400).json(fail("MISSING_TRADE_ID", "tradeId query parameter is required"));
      }

      // Verify trade belongs to user and strategy
      const trades = await storage.getSimTrades(userId, req.params.id, 0, Date.now(), 1000);
      const trade = trades.trades.find((t) => t.id === tradeId);
      if (!trade) {
        return res.status(404).json(fail("NOT_FOUND", "Trade not found"));
      }

      const events = await storage.getSimTradeEvents(tradeId);

      res.json(ok({ events }));
    } catch (error) {
      logger.error("Get trade events error", "invest-routes", { userId, strategyId: req.params.id }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.post("/api/invest/strategies/:id/invest", isAuthenticated, investRateLimiter, async (req, res) => {
    try {
      const body = InvestMutationSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(fail("INVALID_BODY", "Invalid body", body.error.flatten()));
      }

      const userId = getUserId(req);
      const strategyId = req.params.id;
      const requestId = body.data.requestId ?? (req.headers["idempotency-key"] as string | undefined);
      const amountMinor = BigInt(body.data.amountMinor);

      if (requestId) {
        const existing = await storage.getSimAllocationByRequest(userId, strategyId, requestId);
        if (existing) {
          return res.json(ok({ allocationId: existing.id, status: existing.status }));
        }
      }

      const summary = await getStrategyById(strategyId);
      if (!summary) {
        // Audit log: strategy not found
        await storage.createAuditLog({
          userId,
          event: "INVEST_CREATE",
          resourceType: "strategy",
          resourceId: strategyId,
          details: {
            amountMinor: body.data.amountMinor,
            requestId: requestId || null,
            errorCode: "NOT_FOUND",
            outcome: "failure",
          },
          ip: req.ip || req.headers["x-forwarded-for"]?.toString() || undefined,
          userAgent: req.headers["user-agent"] || undefined,
        }).catch((err) => {
          logger.error("Failed to create audit log for invest failure", "invest-routes", { userId, strategyId }, err);
        });
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const currentState = await storage.getInvestState(userId, strategyId);
      const transition = transitionState((currentState?.state as InvestState) ?? InvestStates.NOT_INVESTED, InvestStates.INVESTED_ACTIVE);
      if (!transition.ok) {
        // Audit log: invalid state
        await storage.createAuditLog({
          userId,
          event: "INVEST_CREATE",
          resourceType: "strategy",
          resourceId: strategyId,
          details: {
            amountMinor: body.data.amountMinor,
            requestId: requestId || null,
            errorCode: "INVALID_STATE",
            errorMessage: transition.error,
            outcome: "failure",
          },
          ip: req.ip || req.headers["x-forwarded-for"]?.toString() || undefined,
          userAgent: req.headers["user-agent"] || undefined,
        }).catch((err) => {
          logger.error("Failed to create audit log for invest failure", "invest-routes", { userId, strategyId }, err);
        });
        return res.status(409).json(fail("INVALID_STATE", transition.error));
      }

      // ATOMIC TRANSACTION: balance deduct + allocation + state update
      const { allocation } = await withTransaction(async (tx) => {
        // Check and deduct balance
        const [currentBalance] = await tx.select().from(balances)
          .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
        
        if (!currentBalance || BigInt(currentBalance.available) < amountMinor) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        const newAvailable = BigInt(currentBalance.available) - amountMinor;
        if (newAvailable < 0n) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        await tx.update(balances)
          .set({ available: newAvailable.toString(), updatedAt: new Date() })
          .where(eq(balances.id, currentBalance.id));

        // Create allocation
        const [allocation] = await tx.insert(simAllocations).values({
          userId,
          strategyId,
          amountMinor: body.data.amountMinor,
          status: "ACTIVE",
          requestId,
        }).returning();

        // Update state
        await tx.insert(investState).values({
          userId,
          strategyId,
          state: transition.state,
          requestId,
        }).onConflictDoUpdate({
          target: [investState.userId, investState.strategyId],
          set: { state: transition.state, requestId, updatedAt: new Date() },
        });

        return { allocation };
      });

      // Register engine loop for this investment (if engine is enabled)
      if (process.env.ENGINE_ENABLED !== "false") {
        await registerEngineLoop(userId, strategyId).catch((err) => {
          logger.error("Failed to register engine loop after invest", "invest-routes", { userId, strategyId }, err);
        });
      }

      // Audit log: successful invest
      await storage.createAuditLog({
        userId,
        event: "INVEST_CREATE",
        resourceType: "strategy",
        resourceId: strategyId,
        details: {
          amountMinor: body.data.amountMinor,
          requestId: requestId || null,
          allocationId: allocation.id,
        },
        ip: req.ip || req.headers["x-forwarded-for"]?.toString() || undefined,
        userAgent: req.headers["user-agent"] || undefined,
      }).catch((err) => {
        logger.error("Failed to create audit log for invest", "invest-routes", { userId, strategyId }, err);
      });

      res.json(ok({ allocationId: allocation.id, status: allocation.status }));
    } catch (error) {
      const userId = getUserId(req);
      const strategyId = req.params.id;
      const requestId = (req.body as any)?.requestId ?? (req.headers["idempotency-key"] as string | undefined);
      const amountMinor = (req.body as any)?.amountMinor;

      // Audit log: failed invest
      let errorCode = "INTERNAL_ERROR";
      if (error instanceof Error) {
        if (error.message === "INSUFFICIENT_BALANCE") {
          errorCode = "INSUFFICIENT_BALANCE";
        }
      }

      await storage.createAuditLog({
        userId,
        event: "INVEST_CREATE",
        resourceType: "strategy",
        resourceId: strategyId,
        details: {
          amountMinor: amountMinor || null,
          requestId: requestId || null,
          errorCode,
          outcome: "failure",
        },
        ip: req.ip || req.headers["x-forwarded-for"]?.toString() || undefined,
        userAgent: req.headers["user-agent"] || undefined,
      }).catch((err) => {
        logger.error("Failed to create audit log for invest failure", "invest-routes", { userId, strategyId }, err);
      });

      if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json(fail("INSUFFICIENT_BALANCE", "Insufficient balance"));
      }
      logger.error("Invest mutation error", "invest-routes", { userId, strategyId }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.post("/api/invest/strategies/:id/withdraw", isAuthenticated, investRateLimiter, async (req, res) => {
    const userId = getUserId(req);
    try {
      const body = WithdrawMutationSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(fail("INVALID_BODY", "Invalid body", body.error.flatten()));
      }

      const strategyId = req.params.id;
      const requestId = body.data.requestId ?? (req.headers["idempotency-key"] as string | undefined);
      const amountMinor = BigInt(body.data.amountMinor);

      if (amountMinor <= 0n) {
        return res.status(400).json(fail("INVALID_AMOUNT", "Amount must be positive"));
      }

      // Check idempotency
      if (requestId) {
        const existing = await storage.getSimAllocationByRequest(userId, strategyId, requestId);
        if (existing) {
          return res.json(ok({ allocationId: existing.id, status: existing.status }));
        }
      }

      const currentState = await storage.getInvestState(userId, strategyId);
      if (!currentState || currentState.state !== InvestStates.INVESTED_ACTIVE) {
        return res.status(409).json(fail("INVALID_STATE", "No active investment to withdraw from"));
      }

      // ATOMIC TRANSACTION: SELECT FOR UPDATE allocation, decrease it, credit balance, update state
      const { allocation, newState } = await withTransaction(async (tx) => {
        // SELECT FOR UPDATE: lock active allocation
        const result = await tx.execute(sql`
          SELECT id, user_id, strategy_id, amount_minor, status, request_id, created_at, updated_at
          FROM sim_allocations
          WHERE user_id = ${userId}
            AND strategy_id = ${strategyId}
            AND status = 'ACTIVE'
          LIMIT 1
          FOR UPDATE
        `);
        
        if (result.rows.length === 0) {
          throw new Error("NO_ACTIVE_ALLOCATION");
        }
        
        const row = result.rows[0] as {
          id: string;
          user_id: string;
          strategy_id: string;
          amount_minor: string;
          status: string;
          request_id: string | null;
          created_at: Date | null;
          updated_at: Date | null;
        };
        
        const activeAllocation = {
          id: row.id,
          userId: row.user_id,
          strategyId: row.strategy_id,
          amountMinor: row.amount_minor,
          status: row.status,
          requestId: row.request_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        const allocatedMinor = BigInt(activeAllocation.amountMinor);
        if (allocatedMinor < amountMinor) {
          throw new Error("INSUFFICIENT_ALLOCATION");
        }

        // Credit balance back
        const [currentBalance] = await tx.select().from(balances)
          .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
        
        if (!currentBalance) {
          // Create balance if it doesn't exist
          await tx.insert(balances).values({
            userId,
            asset: "USDT",
            available: amountMinor.toString(),
            locked: "0",
          });
        } else {
          const newAvailable = BigInt(currentBalance.available) + amountMinor;
          await tx.update(balances)
            .set({ available: newAvailable.toString(), updatedAt: new Date() })
            .where(eq(balances.id, currentBalance.id));
        }

        // Decrease allocation or close it if becomes 0
        const remainingMinor = allocatedMinor - amountMinor;
        let updatedAllocation: SimAllocation;
        
        if (remainingMinor === 0n) {
          // Close allocation
          [updatedAllocation] = await tx.update(simAllocations)
            .set({ 
              amountMinor: "0",
              status: "CLOSED",
              updatedAt: new Date() 
            })
            .where(eq(simAllocations.id, activeAllocation.id))
            .returning();
        } else {
          // Decrease allocation
          [updatedAllocation] = await tx.update(simAllocations)
            .set({ 
              amountMinor: remainingMinor.toString(),
              updatedAt: new Date() 
            })
            .where(eq(simAllocations.id, activeAllocation.id))
            .returning();
        }

        // Update invest_state: NOT_INVESTED if allocation closed, otherwise keep INVESTED_ACTIVE
        const finalState = remainingMinor === 0n ? InvestStates.NOT_INVESTED : InvestStates.INVESTED_ACTIVE;
        await tx.insert(investState).values({
          userId,
          strategyId,
          state: finalState,
          requestId,
        }).onConflictDoUpdate({
          target: [investState.userId, investState.strategyId],
          set: { state: finalState, requestId, updatedAt: new Date() },
        });

        return { allocation: updatedAllocation, newState: finalState };
      });

      // Audit log: successful withdraw
      await storage.createAuditLog({
        userId,
        event: "INVEST_WITHDRAW",
        resourceType: "strategy",
        resourceId: strategyId,
        details: {
          amountMinor: body.data.amountMinor,
          requestId: requestId || null,
          allocationId: allocation.id,
          finalState: newState,
        },
        ip: req.ip || req.headers["x-forwarded-for"]?.toString() || undefined,
        userAgent: req.headers["user-agent"] || undefined,
      }).catch((err) => {
        logger.error("Failed to create audit log for withdraw", "invest-routes", { userId, strategyId }, err);
      });

      res.json(ok({ allocationId: allocation.id, status: allocation.status }));
    } catch (error) {
      const strategyId = req.params.id;
      const requestId = (req.body as any)?.requestId ?? (req.headers["idempotency-key"] as string | undefined);
      const amountMinor = (req.body as any)?.amountMinor;

      // Audit log: failed withdraw
      let errorCode = "INTERNAL_ERROR";
      if (error instanceof Error) {
        if (error.message === "NO_ACTIVE_ALLOCATION") {
          errorCode = "NO_ACTIVE_ALLOCATION";
        } else if (error.message === "INSUFFICIENT_ALLOCATION") {
          errorCode = "INSUFFICIENT_ALLOCATION";
        }
      }

      await storage.createAuditLog({
        userId,
        event: "INVEST_WITHDRAW",
        resourceType: "strategy",
        resourceId: strategyId,
        details: {
          amountMinor: amountMinor || null,
          requestId: requestId || null,
          errorCode,
          outcome: "failure",
        },
        ip: req.ip || req.headers["x-forwarded-for"]?.toString() || undefined,
        userAgent: req.headers["user-agent"] || undefined,
      }).catch((err) => {
        logger.error("Failed to create audit log for withdraw failure", "invest-routes", { userId, strategyId }, err);
      });

      if (error instanceof Error) {
        if (error.message === "NO_ACTIVE_ALLOCATION") {
          return res.status(404).json(fail("NO_ACTIVE_ALLOCATION", "No active allocation found"));
        }
        if (error.message === "INSUFFICIENT_ALLOCATION") {
          return res.status(400).json(fail("INSUFFICIENT_ALLOCATION", "Insufficient allocation in strategy"));
        }
      }
      logger.error("Withdraw mutation error", "invest-routes", { userId, strategyId }, error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });
}
