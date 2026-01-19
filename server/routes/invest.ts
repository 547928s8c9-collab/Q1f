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

async function resolveProfile(strategyId: string): Promise<{ strategy: { id: string; name: string }; profile: StrategyProfile } | null> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) return null;

  const profiles = await storage.getStrategyProfiles();
  const profile = profiles.find((item) => item.displayName === strategy.name);

  if (!profile) return null;

  return { strategy: { id: strategy.id, name: strategy.name }, profile };
}

export function registerInvestRoutes({ app }: RouteDeps): void {
  app.get("/api/invest/strategies/:id/candles", async (req, res) => {
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

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        allowLargeRange: true,
      });

      res.json({
        ...result,
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
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        allowLargeRange: true,
      });

      if (result.candles.length === 0) {
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
        candles: result.candles,
        profileSlug: profile.slug as StrategyProfileSlug,
        config,
        meta: {
          symbol: profile.symbol,
          timeframe,
        },
      });

      res.json({
        trades,
        metrics,
        timeframe,
        periodDays,
        symbol: profile.symbol,
      });
    } catch (error) {
      console.error("Invest insights error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
