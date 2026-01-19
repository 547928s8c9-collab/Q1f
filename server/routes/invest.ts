import { z } from "zod";
import type { Timeframe } from "@shared/schema";
import { VALID_TIMEFRAMES } from "@shared/schema";
import { and, desc, eq, gte } from "drizzle-orm";
import { loadCandles } from "../marketData/loadCandles";
import { db } from "../db";
import { operations } from "@shared/schema";
import { storage } from "../storage";
import { acquireIdempotencyLock, completeIdempotency } from "../lib/idempotency";
import { getNextWeeklyWindow } from "../lib/redemptionWindow";
import { executeInvestment, validateInvestAccess, validateInvestment } from "./investService";
import type { RouteDeps } from "./types";

const DEFAULT_PERIOD_DAYS = 30;
const MAX_PERIOD_DAYS = 365;

const amountSchema = z.string()
  .regex(/^\d+$/, "Amount must contain only digits")
  .refine((val) => BigInt(val) > 0n, "Amount must be greater than zero");

export function parsePeriodDays(
  value: unknown,
  fallback: number = DEFAULT_PERIOD_DAYS,
): { ok: true; days: number } | { ok: false; error: { code: string; message: string } } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, days: fallback };
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return { ok: false, error: { code: "INVALID_PERIOD", message: "Period must be a string" } };
  }

  const match = raw.match(/^(\d+)(d)?$/i);
  if (!match) {
    return { ok: false, error: { code: "INVALID_PERIOD", message: "Period must be a positive integer (days)" } };
  }

  const days = parseInt(match[1], 10);
  if (Number.isNaN(days) || days <= 0) {
    return { ok: false, error: { code: "INVALID_PERIOD", message: "Period must be greater than zero" } };
  }

  if (days > MAX_PERIOD_DAYS) {
    return {
      ok: false,
      error: { code: "PERIOD_TOO_LARGE", message: `Period cannot exceed ${MAX_PERIOD_DAYS} days` },
    };
  }

  return { ok: true, days };
}

export function registerInvestRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  // GET /api/invest/strategies (protected)
  app.get("/api/invest/strategies", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const [strategies, positions] = await Promise.all([
        storage.getStrategies(),
        storage.getPositions(userId),
      ]);
      res.json({ strategies, positions });
    } catch (error) {
      console.error("Get invest strategies error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/invest/strategies/:strategyId/overview (protected)
  app.get("/api/invest/strategies/:strategyId/overview", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const strategyId = req.params.strategyId;
      const periodResult = parsePeriodDays(req.query.period);
      if (!periodResult.ok) {
        return res.status(400).json({ error: periodResult.error });
      }

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const [performance, position] = await Promise.all([
        storage.getStrategyPerformance(strategyId, periodResult.days),
        storage.getPosition(userId, strategyId),
      ]);

      res.json({
        strategy,
        performance,
        position: position || null,
        periodDays: periodResult.days,
      });
    } catch (error) {
      console.error("Get invest strategy overview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/invest/strategies/:strategyId/candles (protected)
  app.get("/api/invest/strategies/:strategyId/candles", isAuthenticated, async (req, res) => {
    try {
      const strategyId = req.params.strategyId;
      const { symbol, timeframe, exchange } = req.query;
      const periodResult = parsePeriodDays(req.query.period);
      if (!periodResult.ok) {
        return res.status(400).json({ error: periodResult.error });
      }

      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({
          error: { code: "MISSING_SYMBOL", message: "Query param 'symbol' is required" },
        });
      }

      if (!timeframe || typeof timeframe !== "string") {
        return res.status(400).json({
          error: { code: "MISSING_TIMEFRAME", message: "Query param 'timeframe' is required" },
        });
      }

      if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
        return res.status(400).json({
          error: {
            code: "INVALID_TIMEFRAME",
            message: `Invalid timeframe. Allowed: ${VALID_TIMEFRAMES.join(", ")}`,
          },
        });
      }

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const endMs = Date.now();
      const startMs = endMs - periodResult.days * 24 * 60 * 60 * 1000;

      const result = await loadCandles({
        exchange: typeof exchange === "string" ? exchange : undefined,
        symbol,
        timeframe: timeframe as Timeframe,
        startMs,
        endMs,
      });

      res.json({
        candles: result.candles,
        gaps: result.gaps,
        source: result.source,
        periodDays: periodResult.days,
      });
    } catch (error) {
      console.error("Get invest strategy candles error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // GET /api/invest/strategies/:strategyId/trades (protected)
  app.get("/api/invest/strategies/:strategyId/trades", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const strategyId = req.params.strategyId;
      const periodResult = parsePeriodDays(req.query.period);
      if (!periodResult.ok) {
        return res.status(400).json({ error: periodResult.error });
      }

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - periodResult.days);

      const trades = await db.select().from(operations)
        .where(and(
          eq(operations.userId, userId),
          eq(operations.strategyId, strategyId),
          gte(operations.createdAt, startDate),
        ))
        .orderBy(desc(operations.createdAt));

      res.json({ trades, periodDays: periodResult.days });
    } catch (error) {
      console.error("Get invest strategy trades error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/invest/strategies/:strategyId/invest (protected, idempotent)
  app.post("/api/invest/strategies/:strategyId/invest", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const strategyId = req.params.strategyId;
    const endpoint = `/api/invest/strategies/${strategyId}/invest`;
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;

    try {
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({ amount: amountSchema });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      const { amount } = parsed.data;

      const validation = await validateInvestment(userId, strategyId, amount);
      if (!validation.ok) {
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, validation.status, validation.body);
        }
        return res.status(validation.status).json(validation.body);
      }

      const operation = await executeInvestment({
        req,
        userId,
        strategyId,
        amount,
        strategy: validation.strategy,
      });

      const responseBody = { success: true, operation: { id: operation.id } };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Invest strategy error:", error);
      if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
        const errorBody = { error: "Insufficient balance" };
        if (lock?.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });

  // POST /api/invest/strategies/:strategyId/withdraw (protected, idempotent)
  app.post("/api/invest/strategies/:strategyId/withdraw", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const strategyId = req.params.strategyId;
    const endpoint = `/api/invest/strategies/${strategyId}/withdraw`;
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;

    try {
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({ amountMinor: amountSchema.optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      const access = await validateInvestAccess(userId);
      if (!access.ok) {
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, access.status, access.body);
        }
        return res.status(access.status).json(access.body);
      }

      const position = await storage.getPosition(userId, strategyId);
      if (!position) {
        const errorBody = { error: "No position found for this strategy" };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      const principalMinor = BigInt(position.principalMinor || position.principal || "0");
      if (principalMinor <= 0n) {
        const errorBody = { error: "No principal to redeem" };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      const { amountMinor } = parsed.data;
      if (amountMinor) {
        const requestedAmount = BigInt(amountMinor);
        if (requestedAmount <= 0n) {
          const errorBody = { error: "Amount must be positive" };
          if (lock.acquired) {
            await completeIdempotency(lock.keyId, null, 400, errorBody);
          }
          return res.status(400).json(errorBody);
        }
        if (requestedAmount > principalMinor) {
          const errorBody = {
            error: "Insufficient principal",
            available: principalMinor.toString(),
            requested: amountMinor,
          };
          if (lock.acquired) {
            await completeIdempotency(lock.keyId, null, 400, errorBody);
          }
          return res.status(400).json(errorBody);
        }
      }

      const executeAt = getNextWeeklyWindow();

      const request = await storage.createRedemptionRequest({
        userId,
        strategyId,
        amountMinor: amountMinor || null,
        executeAt,
        status: "PENDING",
      });

      const responseBody = {
        success: true,
        redemption: {
          id: request.id,
          strategyId: request.strategyId,
          amountMinor: request.amountMinor,
          executeAt: executeAt.toISOString(),
          status: request.status,
        },
      };

      if (lock.acquired) {
        await completeIdempotency(lock.keyId, request.id, 200, responseBody);
      }

      res.json(responseBody);
    } catch (error) {
      console.error("Withdraw strategy error:", error);
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });
}
