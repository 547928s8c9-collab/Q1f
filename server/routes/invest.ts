import type { InvestMetrics, InvestTrade, StrategyProfile, Timeframe } from "@shared/schema";
import type { RouteDeps } from "./types";
import { storage } from "../storage";
import { loadCandles } from "../marketData/loadCandles";
import { normalizeTimeframe } from "../marketData/utils";
import { simulateInvestStrategy } from "../strategies/investSimulation";
import type { StrategyConfig, StrategyProfileSlug } from "../strategies/types";

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 1;
const MAX_PERIOD_DAYS = 730;
const DAY_MS = 86_400_000;

const MAX_PERIOD_BY_TIMEFRAME: Record<Timeframe, number> = {
  "1m": 7,
  "5m": 30,
  "15m": 90,
  "1h": 180,
  "1d": 730,
};

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

function parsePeriodDays(raw: string | undefined, timeframe: Timeframe): number {
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_PERIOD_DAYS;
  if (Number.isNaN(parsed)) return DEFAULT_PERIOD_DAYS;
  const maxAllowed = MAX_PERIOD_BY_TIMEFRAME[timeframe] ?? MAX_PERIOD_DAYS;
  return Math.min(Math.max(parsed, MIN_PERIOD_DAYS), Math.min(MAX_PERIOD_DAYS, maxAllowed));
}

async function resolveProfile(strategyId: string): Promise<{ strategy: { id: string; name: string }; profile: StrategyProfile } | null> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) return null;

  const profiles = await storage.getStrategyProfiles();
  const profile = profiles.find((item) => item.displayName === strategy.name);

  if (!profile) return null;

  return { strategy: { id: strategy.id, name: strategy.name }, profile };
}

const USDT_MINOR_FACTOR = 1_000_000;

function toMajorUnits(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed / USDT_MINOR_FACTOR;
}

function formatSimTrades(trades: Awaited<ReturnType<typeof storage.getSimTrades>>, timeframe: Timeframe): InvestTrade[] {
  const tfMs = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "1d": 86_400_000,
  }[timeframe];

  return trades.map((trade) => {
    const entryPrice = Number(trade.entryPrice ?? 0);
    const exitPrice = Number(trade.exitPrice ?? entryPrice);
    const qty = Number(trade.qty ?? 0);
    const netPnl = toMajorUnits(trade.netPnlMinor);
    const entryNotional = entryPrice * qty;
    const netPnlPct = entryNotional > 0 ? (netPnl / entryNotional) * 100 : 0;
    const holdBars =
      trade.exitTs && trade.entryTs && tfMs ? Math.max(0, Math.round((trade.exitTs - trade.entryTs) / tfMs)) : 0;

    return {
      id: trade.id,
      entryTs: trade.entryTs ?? trade.createdAt?.getTime?.() ?? Date.now(),
      exitTs: trade.exitTs ?? trade.entryTs ?? Date.now(),
      entryPrice,
      exitPrice,
      qty,
      netPnl,
      netPnlPct,
      holdBars,
      reason: trade.reason ?? "",
      status: trade.status === "OPEN" ? "OPEN" : "CLOSED",
      side: "LONG",
    };
  });
}

function calculateSimMetrics(trades: InvestTrade[]): InvestMetrics {
  if (trades.length === 0) return emptyMetrics;

  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.netPnl > 0).length;
  const grossPnl = trades.reduce((sum, trade) => sum + Math.max(0, trade.netPnl), 0);
  const losses = trades.reduce((sum, trade) => sum + Math.max(0, -trade.netPnl), 0);
  const fees = 0;
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const netPnlPct = trades.reduce((sum, trade) => sum + trade.netPnlPct, 0) / Math.max(1, totalTrades);
  const avgHoldBars = trades.reduce((sum, trade) => sum + trade.holdBars, 0) / Math.max(1, totalTrades);
  const avgTradePnl = netPnl / Math.max(1, totalTrades);
  const profitFactor = losses > 0 ? grossPnl / losses : grossPnl > 0 ? Number.POSITIVE_INFINITY : 0;

  return {
    totalTrades,
    winRatePct: (wins / totalTrades) * 100,
    netPnl,
    netPnlPct,
    grossPnl,
    fees,
    avgHoldBars,
    profitFactor,
    avgTradePnl,
  };
}

export function registerInvestRoutes({ app }: RouteDeps): void {
  app.get("/api/invest/strategies/:id/candles", async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const { profile } = resolved;
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const periodDays = parsePeriodDays(req.query.period as string | undefined, timeframe);
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
      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? profile.timeframe);
      const periodDays = parsePeriodDays(req.query.period as string | undefined, timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      const result = await loadCandles({
        symbol: profile.symbol,
        timeframe,
        startMs,
        endMs,
        allowLargeRange: true,
      });

      const simTrades = await storage.getSimTrades(resolved.strategy.id, startMs, endMs);
      const formattedSimTrades = formatSimTrades(simTrades, timeframe);
      const simMetrics = calculateSimMetrics(formattedSimTrades);

      if (result.candles.length === 0) {
        return res.json({
          trades: formattedSimTrades,
          metrics: formattedSimTrades.length ? simMetrics : emptyMetrics,
          timeframe,
          periodDays,
          symbol: profile.symbol,
        });
      }

      let simulated: ReturnType<typeof simulateInvestStrategy> | null = null;
      if (formattedSimTrades.length === 0) {
        const config = profile.defaultConfig as StrategyConfig;
        simulated = simulateInvestStrategy({
          candles: result.candles,
          profileSlug: profile.slug as StrategyProfileSlug,
          config,
          meta: {
            symbol: profile.symbol,
            timeframe,
          },
        });
      }

      const trades = formattedSimTrades.length ? formattedSimTrades : simulated?.trades ?? [];
      const metrics = formattedSimTrades.length ? simMetrics : simulated?.metrics ?? emptyMetrics;

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

  app.get("/api/invest/strategies/:id/benchmarks", async (req, res) => {
    try {
      const resolved = await resolveProfile(req.params.id);
      if (!resolved) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const timeframe = normalizeTimeframe((req.query.timeframe as string) ?? "1d");
      const periodDays = parsePeriodDays(req.query.period as string | undefined, timeframe);
      const endMs = Date.now();
      const startMs = endMs - periodDays * DAY_MS;

      const benchmarks = [
        { key: "sp500", symbol: "SPXUSD" },
        { key: "btc", symbol: "BTCUSD" },
        { key: "gold", symbol: "XAUUSD" },
      ];

      const results = await Promise.all(
        benchmarks.map(async (benchmark) => {
          const data = await loadCandles({
            symbol: benchmark.symbol,
            timeframe,
            startMs,
            endMs,
            allowLargeRange: true,
          });
          return { ...benchmark, data };
        })
      );

      const response = results.reduce<Record<string, { symbol: string; candles: typeof results[number]["data"]["candles"] }>>(
        (acc, item) => {
          acc[item.key] = { symbol: item.symbol, candles: item.data.candles };
          return acc;
        },
        {}
      );

      res.json({
        benchmarks: response,
        timeframe,
        periodDays,
      });
    } catch (error) {
      console.error("Invest benchmarks error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
