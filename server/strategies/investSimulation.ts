import type { Candle, InvestMetrics, InvestTrade } from "@shared/schema";
import { timeframeToMs } from "../marketData/utils";
import { createStrategy } from "./factory";
import type { StrategyConfig, StrategyMeta, StrategyProfileSlug, TradeStats } from "./types";

const DEFAULT_STARTING_EQUITY = 10_000;

interface MetricsParams {
  trades: InvestTrade[];
  stats: TradeStats;
  startingEquity?: number;
}

export function calculateInvestMetrics({
  trades,
  stats,
  startingEquity = DEFAULT_STARTING_EQUITY,
}: MetricsParams): InvestMetrics {
  const totalTrades = stats.totalTrades || trades.length;
  const winRatePct = totalTrades > 0 ? (stats.wins / totalTrades) * 100 : 0;
  const avgHoldBars =
    trades.length > 0
      ? trades.reduce((sum, trade) => sum + trade.holdBars, 0) / trades.length
      : 0;
  const avgTradePnl = totalTrades > 0 ? stats.netPnl / totalTrades : 0;
  const netPnlPct = startingEquity > 0 ? (stats.netPnl / startingEquity) * 100 : 0;

  const gains = trades.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0);
  const losses = trades.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + Math.abs(trade.netPnl), 0);
  const profitFactor = losses > 0 ? gains / losses : gains > 0 ? Number.POSITIVE_INFINITY : 0;

  return {
    totalTrades,
    winRatePct,
    netPnl: stats.netPnl,
    netPnlPct,
    grossPnl: stats.grossPnl,
    fees: stats.fees,
    avgHoldBars,
    profitFactor,
    avgTradePnl,
  };
}

interface SimulationParams {
  candles: Candle[];
  profileSlug: StrategyProfileSlug;
  config: StrategyConfig;
  meta: StrategyMeta;
}

export function simulateInvestStrategy({
  candles,
  profileSlug,
  config,
  meta,
}: SimulationParams): { trades: InvestTrade[]; metrics: InvestMetrics } {
  const strategy = createStrategy(profileSlug, config, meta);
  const trades: InvestTrade[] = [];
  const timeframeMs = timeframeToMs(meta.timeframe);
  const useOracle = config.oracleExit?.enabled ?? false;
  const horizonBars = config.oracleExit?.horizonBars ?? 0;

  candles.forEach((candle, index) => {
    const futureCandles = useOracle ? candles.slice(index + 1, index + 1 + horizonBars) : undefined;
    const events = strategy.onCandle(candle, futureCandles);

    events.forEach((event) => {
      if (event.payload.type !== "trade") return;
      const trade = event.payload.data;
      const entryTs = event.ts - trade.holdBars * timeframeMs;
      const entryNotional = trade.entryPrice * trade.qty;
      // Guard against division by zero and invalid values
      const netPnlPct = entryNotional > 0 && Number.isFinite(trade.netPnl) 
        ? (trade.netPnl / entryNotional) * 100 
        : 0;

      trades.push({
        id: `${event.ts}-${event.seq}`,
        entryTs,
        exitTs: event.ts,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        qty: trade.qty,
        netPnl: trade.netPnl,
        netPnlPct,
        holdBars: trade.holdBars,
        reason: trade.reason,
      });
    });
  });

  const state = strategy.getState();
  const metrics = calculateInvestMetrics({ trades, stats: state.stats });

  return { trades, metrics };
}
