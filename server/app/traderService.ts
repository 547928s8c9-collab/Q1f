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
  // Validate allocation: must be positive
  const allocatedMinor = BigInt(params.allocatedMinor || "0");
  if (allocatedMinor <= 0n) {
    throw new Error("INVALID_ALLOCATION");
  }

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
  // Guard against NaN/Infinity
  const safeNetPnlPct = Number.isFinite(metrics.netPnlPct) ? metrics.netPnlPct : 0;
  const targetPct = clamp(safeNetPnlPct, minPct, maxPct);
  const scale = safeNetPnlPct !== 0 && Number.isFinite(safeNetPnlPct) ? targetPct / safeNetPnlPct : 0;

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
    const tradeId = await storage.createSimTrade({
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

    // Log trade events for timeline
    // TRADE_INTENT event
    await storage.createSimTradeEvent({
      userId: params.userId,
      strategyId: params.strategyId,
      tradeId: tradeId.id,
      type: "TRADE_INTENT",
      ts: trade.entryTs,
      payloadJson: {
        symbol: params.symbol,
        side: "LONG",
        intendedPrice: trade.entryPrice,
        intendedQty: trade.qty,
        reason: trade.reason,
      },
    }).catch(() => {});

    // ORDER_PLACED event
    await storage.createSimTradeEvent({
      userId: params.userId,
      strategyId: params.strategyId,
      tradeId: tradeId.id,
      type: "ORDER_PLACED",
      ts: trade.entryTs,
      payloadJson: {
        symbol: params.symbol,
        side: "LONG",
        orderType: "MARKET",
        qty: trade.qty,
      },
    }).catch(() => {});

    // FILLED event (entry)
    await storage.createSimTradeEvent({
      userId: params.userId,
      strategyId: params.strategyId,
      tradeId: tradeId.id,
      type: "FILLED",
      ts: trade.entryTs,
      payloadJson: {
        symbol: params.symbol,
        side: "LONG",
        price: trade.entryPrice,
        qty: trade.qty,
        fee: 0,
        slippage: 0,
      },
    }).catch(() => {});

    // CLOSED event (exit)
    await storage.createSimTradeEvent({
      userId: params.userId,
      strategyId: params.strategyId,
      tradeId: tradeId.id,
      type: "CLOSED",
      ts: trade.exitTs,
      payloadJson: {
        symbol: params.symbol,
        side: "LONG",
        price: trade.exitPrice,
        qty: trade.qty,
        fee: 0,
        slippage: 0,
        netPnl: trade.netPnl,
        holdBars: trade.holdBars,
        reason: trade.reason,
      },
    }).catch(() => {});

    // Log TRADE_OPEN (when trade is created) - keep for backward compatibility
    await storage.createEngineEvent({
      userId: params.userId,
      strategyId: params.strategyId,
      type: "TRADE_OPEN",
      severity: "info",
      message: `Trade opened: ${params.symbol} @ ${trade.entryPrice.toFixed(2)}`,
      payloadJson: {
        tradeId: tradeId.id,
        symbol: params.symbol,
        entryPrice: trade.entryPrice,
        qty: trade.qty,
        entryTs: trade.entryTs,
      },
    }).catch(() => {
      // Ignore logging errors
    });

    // Log TRADE_CLOSE (when trade is closed) - keep for backward compatibility
    await storage.createEngineEvent({
      userId: params.userId,
      strategyId: params.strategyId,
      type: "TRADE_CLOSE",
      severity: "info",
      message: `Trade closed: ${params.symbol} @ ${trade.exitPrice.toFixed(2)} (PnL: ${trade.netPnl >= 0 ? "+" : ""}${trade.netPnl.toFixed(2)})`,
      payloadJson: {
        tradeId: tradeId.id,
        symbol: params.symbol,
        exitPrice: trade.exitPrice,
        netPnl: trade.netPnl,
        holdBars: trade.holdBars,
        reason: trade.reason,
        exitTs: trade.exitTs,
      },
    }).catch(() => {
      // Ignore logging errors
    });
  }

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

  // Update position.investedCurrentMinor as cache of latest snapshot (with throttling/threshold)
  try {
    const position = await storage.getPosition(params.userId, params.strategyId);
    if (!position) {
      return; // No position to update
    }

    const currentEquityMinor = BigInt(position.investedCurrentMinor || "0");
    const newEquityMinor = equityMinor;
    const equityDiff = currentEquityMinor > newEquityMinor 
      ? currentEquityMinor - newEquityMinor 
      : newEquityMinor - currentEquityMinor;

    // Throttling: update at most once per 2-5 ticks (check updatedAt)
    // Threshold: update if equity changed > 0.1% (1000 minor units per 1M allocated)
    const THROTTLE_MS = 30 * 1000; // 30 seconds (assuming ~1 tick per 10-15s, this is ~2-3 ticks)
    const THRESHOLD_MINOR = allocatedMinor / 1000n; // 0.1% of allocated
    const shouldUpdate = 
      !position.updatedAt || // Never updated
      Date.now() - position.updatedAt.getTime() > THROTTLE_MS || // Throttle expired
      equityDiff > THRESHOLD_MINOR; // Significant change

    if (shouldUpdate) {
      await storage.updatePosition(position.id, {
        investedCurrentMinor: newEquityMinor.toString(),
      });
    }
  } catch (error) {
    // Don't fail trader if position update fails (non-critical optimization)
    // Log silently or use debug level
  }
}
