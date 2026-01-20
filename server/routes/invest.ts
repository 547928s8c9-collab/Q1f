import type { InvestMetrics } from "@shared/schema";
import type { RouteDeps } from "./types";
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

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 180;
const DAY_MS = 86_400_000;

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
      console.error("Invest strategies error:", error);
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
      console.error("Invest overview error:", error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/candles", isAuthenticated, async (req, res) => {
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
      const periodDays = query.data.periodDays ?? DEFAULT_PERIOD_DAYS;
      const timeframe = normalizeTimeframe(query.data.timeframe ?? profile.timeframe);

      const endMs = query.data.endMs ?? Date.now();
      const startMs = query.data.startMs ?? endMs - periodDays * DAY_MS;
      const userId = getUserId(req);

      const result = await getMarketCandles({
        exchange: "synthetic",
        symbol: profile.symbol,
        timeframe,
        fromTs: startMs,
        toTs: endMs,
        userId,
        strategyId: resolved.strategy.id,
        maxCandles: 5000,
      });

      res.json(ok({
        ...result,
        symbol: profile.symbol,
        timeframe,
        periodDays,
      }));
    } catch (error) {
      console.error("Invest candles error:", error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/insights", isAuthenticated, async (req, res) => {
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
      const periodDays = query.data.periodDays ?? DEFAULT_PERIOD_DAYS;
      const timeframe = normalizeTimeframe(query.data.timeframe ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;
      const userId = getUserId(req);

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
      console.error("Invest insights error:", error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.get("/api/invest/strategies/:id/trades", isAuthenticated, async (req, res) => {
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
      const periodDays = query.data.periodDays ?? DEFAULT_PERIOD_DAYS;
      const timeframe = normalizeTimeframe(query.data.timeframe ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;
      const userId = getUserId(req);

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
        return res.json(ok({ trades: [] }));
      }

      const config = profile.defaultConfig as StrategyConfig;
      const { trades } = simulateInvestStrategy({
        candles: result.candles,
        profileSlug: profile.slug as StrategyProfileSlug,
        config,
        meta: {
          symbol: profile.symbol,
          timeframe,
        },
      });

      res.json(ok({ trades }));
    } catch (error) {
      console.error("Invest trades error:", error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.post("/api/invest/strategies/:id/invest", isAuthenticated, async (req, res) => {
    try {
      const body = InvestMutationSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(fail("INVALID_BODY", "Invalid body", body.error.flatten()));
      }

      const userId = getUserId(req);
      const strategyId = req.params.id;
      const requestId = body.data.requestId ?? (req.headers["idempotency-key"] as string | undefined);

      if (requestId) {
        const existing = await storage.getSimAllocationByRequest(userId, strategyId, requestId);
        if (existing) {
          return res.json(ok({ allocationId: existing.id, status: existing.status }));
        }
      }

      const summary = await getStrategyById(strategyId);
      if (!summary) {
        return res.status(404).json(fail("NOT_FOUND", "Strategy not found"));
      }

      const currentState = await storage.getInvestState(userId, strategyId);
      const transition = transitionState((currentState?.state as InvestState) ?? InvestStates.NOT_INVESTED, InvestStates.INVESTED_ACTIVE);
      if (!transition.ok) {
        return res.status(409).json(fail("INVALID_STATE", transition.error));
      }

      const allocation = await storage.createSimAllocation({
        userId,
        strategyId,
        amountMinor: body.data.amountMinor,
        status: "ACTIVE",
        requestId,
      });

      await storage.upsertInvestState({
        userId,
        strategyId,
        state: transition.state,
        requestId,
      });

      res.json(ok({ allocationId: allocation.id, status: allocation.status }));
    } catch (error) {
      console.error("Invest mutation error:", error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });

  app.post("/api/invest/strategies/:id/withdraw", isAuthenticated, async (req, res) => {
    try {
      const body = WithdrawMutationSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json(fail("INVALID_BODY", "Invalid body", body.error.flatten()));
      }

      const userId = getUserId(req);
      const strategyId = req.params.id;
      const requestId = body.data.requestId ?? (req.headers["idempotency-key"] as string | undefined);

      if (requestId) {
        const existing = await storage.getSimAllocationByRequest(userId, strategyId, requestId);
        if (existing) {
          return res.json(ok({ allocationId: existing.id, status: existing.status }));
        }
      }

      const currentState = await storage.getInvestState(userId, strategyId);
      const transition = transitionState((currentState?.state as InvestState) ?? InvestStates.NOT_INVESTED, InvestStates.WITHDRAWING);
      if (!transition.ok) {
        return res.status(409).json(fail("INVALID_STATE", transition.error));
      }

      const allocation = await storage.createSimAllocation({
        userId,
        strategyId,
        amountMinor: body.data.amountMinor,
        status: "WITHDRAWING",
        requestId,
      });

      await storage.upsertInvestState({
        userId,
        strategyId,
        state: transition.state,
        requestId,
      });

      res.json(ok({ allocationId: allocation.id, status: allocation.status }));
    } catch (error) {
      console.error("Withdraw mutation error:", error);
      res.status(500).json(fail("INTERNAL_ERROR", "Internal server error"));
    }
  });
}
