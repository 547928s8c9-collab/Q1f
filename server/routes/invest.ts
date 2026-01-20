import type { InvestMetrics, StrategyProfile } from "@shared/schema";
import type { RouteDeps } from "./types";
import { storage } from "../storage";
import { loadCandles } from "../marketData/loadCandles";
import { normalizeTimeframe } from "../marketData/utils";
import { simulateInvestStrategy } from "../strategies/investSimulation";
import type { StrategyConfig, StrategyProfileSlug } from "../strategies/types";

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 7;
const MAX_PERIOD_DAYS = 180;
const MAX_INVEST_CANDLES = 1500;
const MAX_INVEST_TRADES = 500;
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

function parseLimit(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, fallback);
}

function downsampleCandles(candles: Array<{ ts: number }>, maxPoints: number) {
  if (candles.length <= maxPoints) return candles;
  const step = Math.ceil(candles.length / maxPoints);
  const sampled = candles.filter((_candle, index) => index % step === 0);
  const last = candles[candles.length - 1];
  if (sampled[sampled.length - 1]?.ts !== last.ts) {
    sampled.push(last);
  }
  return sampled;
}

async function resolveProfile(strategyId: string): Promise<{ strategy: { id: string; name: string }; profile: StrategyProfile } | null> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) return null;

  const profiles = await storage.getStrategyProfiles();
  const profile = profiles.find((item) => item.displayName === strategy.name);

  if (!profile) return null;

  return { strategy: { id: strategy.id, name: strategy.name }, profile };
}

export function registerInvestRoutes({ app }: RouteDeps): void {
  app.get("/api/invest/strategies", async (_req, res) => {
    try {
      const strategies = await storage.getStrategies();
      res.json(strategies);
    } catch (error) {
      console.error("Invest strategies error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/invest/strategies/:id/overview", async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      res.json({
        strategy: resolved.strategy,
        profile: resolved.profile,
      });
    } catch (error) {
      console.error("Invest overview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/invest/strategies/:id/candles", async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const { profile } = resolved;
      const periodDays = parsePeriodDays(req.query.period as string | undefined);
      const candleLimit = parseLimit(req.query.limit as string | undefined, MAX_INVEST_CANDLES);
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        maxBars: Math.max(candleLimit * 4, candleLimit),
      });

      const candles = downsampleCandles(result.candles, candleLimit);

      res.json({
        ...result,
        candles,
        symbol: profile.symbol,
        timeframe,
        periodDays,
      });
    } catch (error) {
      console.error("Invest candles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/invest/strategies/:id/insights", async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const { profile } = resolved;
      const periodDays = parsePeriodDays(req.query.period as string | undefined);
      const candleLimit = parseLimit(req.query.limit as string | undefined, MAX_INVEST_CANDLES);
      const tradeLimit = parseLimit(req.query.tradeLimit as string | undefined, MAX_INVEST_TRADES);
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        maxBars: Math.max(candleLimit * 4, candleLimit),
      });

      const candles = downsampleCandles(result.candles, candleLimit);

      if (candles.length === 0) {
        return res.json({
          trades: [],
          metrics: emptyMetrics,
          timeframe,
          periodDays,
          symbol: profile.symbol,
        });
      }

      const config = profile.defaultConfig as StrategyConfig;
      const { trades, metrics } = simulateInvestStrategy({
        candles,
        profileSlug: profile.slug as StrategyProfileSlug,
        config,
        meta: {
          symbol: profile.symbol,
          timeframe,
        },
      });

      const limitedTrades = trades.slice(-tradeLimit);

      res.json({
        trades: limitedTrades,
        metrics,
        timeframe,
        periodDays,
        symbol: profile.symbol,
        tradesTruncated: trades.length > tradeLimit,
      });
    } catch (error) {
      console.error("Invest insights error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
