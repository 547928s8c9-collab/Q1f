import type { Candle } from "@shared/schema";
import type { StrategyConfig, StrategyProfileSlug } from "../strategies/types";
import { simulateInvestStrategy, calculateInvestMetrics } from "../strategies/investSimulation";
import { storage } from "../storage";

const USDT_DECIMALS = 6;

function toMinorUnits(value: number, decimals = USDT_DECIMALS): string {
  return Math.round(value * 10 ** decimals).toString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface TraderParams {
  userId: string;
  strategyId: string;
  profileSlug: StrategyProfileSlug;
  config: StrategyConfig;
  symbol: string;
  timeframe: string;
  candles: Candle[];
  expectedReturnMinBps?: number | null;
  expectedReturnMaxBps?: number | null;
  allocatedMinor: string;
}

export async function runTrader(params: TraderParams): Promise<void> {
  const { trades, metrics } = simulateInvestStrategy({
    candles: params.candles,
    profileSlug: params.profileSlug,
    config: params.config,
    meta: {
      symbol: params.symbol,
      timeframe: params.timeframe,
    },
  });

  const minPct = (params.expectedReturnMinBps ?? 0) / 100;
  const maxPct = (params.expectedReturnMaxBps ?? 500) / 100;
  const targetPct = clamp(metrics.netPnlPct, minPct, maxPct);
  const scale = metrics.netPnlPct !== 0 ? targetPct / metrics.netPnlPct : 0;

  const scaledTrades = trades.map((trade) => ({
    ...trade,
    netPnl: trade.netPnl * scale,
    netPnlPct: trade.netPnlPct * scale,
  }));

  const scaledStats = calculateInvestMetrics({
    trades: scaledTrades,
    stats: {
      totalTrades: scaledTrades.length,
      wins: scaledTrades.filter((t) => t.netPnl > 0).length,
      grossPnl: scaledTrades.reduce((sum, t) => sum + Math.max(0, t.netPnl), 0),
      fees: 0,
      netPnl: scaledTrades.reduce((sum, t) => sum + t.netPnl, 0),
    },
  });

  for (const trade of scaledTrades) {
    await storage.createSimTrade({
      userId: params.userId,
      strategyId: params.strategyId,
      symbol: params.symbol,
      side: "LONG",
      status: "CLOSED",
      entryTs: trade.entryTs,
      exitTs: trade.exitTs,
      entryPrice: trade.entryPrice.toString(),
      exitPrice: trade.exitPrice.toString(),
      qty: trade.qty.toString(),
      grossPnlMinor: toMinorUnits(Math.max(0, trade.netPnl)),
      feesMinor: "0",
      netPnlMinor: toMinorUnits(trade.netPnl),
      holdBars: trade.holdBars,
      reason: trade.reason,
    });
  }

  const allocatedMinor = BigInt(params.allocatedMinor || "0");
  const netPnlMinor = BigInt(toMinorUnits(scaledStats.netPnl));
  const equityMinor = allocatedMinor + netPnlMinor;

  const lastCandle = params.candles[params.candles.length - 1];

  await storage.createSimEquitySnapshot({
    userId: params.userId,
    strategyId: params.strategyId,
    ts: lastCandle?.ts ?? Date.now(),
    equityMinor: equityMinor.toString(),
    allocatedMinor: allocatedMinor.toString(),
    pnlCumMinor: netPnlMinor.toString(),
    cashMinor: equityMinor.toString(),
    positionValueMinor: "0",
    drawdownBps: 0,
  });
}
