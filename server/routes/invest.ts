import type { InvestMetrics, StrategyProfile } from "@shared/schema";
import rateLimit from "express-rate-limit";
import type { RouteDeps } from "./types";
import { storage } from "../storage";
import { loadCandles } from "../marketData/loadCandles";
import { normalizeTimeframe } from "../marketData/utils";
import { simulateInvestStrategy } from "../strategies/investSimulation";
import type { StrategyConfig, StrategyProfileSlug } from "../strategies/types";
import { ResponseCache } from "../lib/responseCache";

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 180;
const DAY_MS = 86_400_000;
const INVEST_DOWNSAMPLE_MAX_BARS = 3500;
const INVEST_CACHE_TTL_MS = 60_000;
const INVEST_INSIGHTS_CACHE_TTL_MS = 90_000;

const investHeavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many invest requests, please slow down" },
  validate: { xForwardedForHeader: false },
});

const candlesCache = new ResponseCache<object>(INVEST_CACHE_TTL_MS, 250);
const insightsCache = new ResponseCache<object>(INVEST_INSIGHTS_CACHE_TTL_MS, 200);

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

async function resolveProfile(strategyId: string): Promise<{ strategy: { id: string; name: string }; profile: StrategyProfile } | null> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) return null;

  const profiles = await storage.getStrategyProfiles();
  const profile = profiles.find((item) => item.displayName === strategy.name);

  if (!profile) return null;

  return { strategy: { id: strategy.id, name: strategy.name }, profile };
}

export function registerInvestRoutes({ app, getUserId }: RouteDeps): void {
  app.get("/api/invest/strategies/:id/candles", investHeavyLimiter, async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const { profile } = resolved;
      const periodDays = parsePeriodDays(req.query.period as string | undefined);
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;
      const userKey = getUserId(req) || req.ip || "anon";
      const cacheKey = `${userKey}:${resolved.strategy.id}:${periodDays}:${timeframe}:candles`;
      const cached = candlesCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        allowLargeRange: true,
        downsampleToMaxBars: INVEST_DOWNSAMPLE_MAX_BARS,
      });

      const response = {
        ...result,
        symbol: profile.symbol,
        timeframe: result.effectiveTimeframe,
        requestedTimeframe: result.requestedTimeframe,
        periodDays,
      };

      candlesCache.set(cacheKey, response);
      res.json(response);
    } catch (error) {
      console.error("Invest candles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/invest/strategies/:id/insights", investHeavyLimiter, async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const { profile } = resolved;
      const periodDays = parsePeriodDays(req.query.period as string | undefined);
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;
      const userKey = getUserId(req) || req.ip || "anon";
      const cacheKey = `${userKey}:${resolved.strategy.id}:${periodDays}:${timeframe}:insights`;
      const cached = insightsCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        allowLargeRange: true,
        downsampleToMaxBars: INVEST_DOWNSAMPLE_MAX_BARS,
      });

      if (result.candles.length === 0) {
        const emptyResponse = {
          trades: [],
          metrics: emptyMetrics,
          timeframe: result.effectiveTimeframe,
          requestedTimeframe: result.requestedTimeframe,
          periodDays,
          symbol: profile.symbol,
        };
        insightsCache.set(cacheKey, emptyResponse);
        return res.json(emptyResponse);
      }

      const config = profile.defaultConfig as StrategyConfig;
      const { trades, metrics } = simulateInvestStrategy({
        candles: result.candles,
        profileSlug: profile.slug as StrategyProfileSlug,
        config,
        meta: {
          symbol: profile.symbol,
          timeframe: result.effectiveTimeframe,
        },
      });

      const response = {
        trades,
        metrics,
        timeframe: result.effectiveTimeframe,
        requestedTimeframe: result.requestedTimeframe,
        periodDays,
        symbol: profile.symbol,
      };
      insightsCache.set(cacheKey, response);
      res.json(response);
    } catch (error) {
      console.error("Invest insights error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
