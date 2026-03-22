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
  liveMode?: boolean;
}

interface TradeRecord {
  entryTs: number;
  exitTs: number;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  netPnl: number;
  netPnlPct: number;
  holdBars: number;
  reason: string;
}

function generateLiveTrade(
  lastPrice: number,
  allocatedMinor: bigint,
  expectedReturnMinBps: number,
  expectedReturnMaxBps: number,
): TradeRecord {
  const now = Date.now();
  const noise = (Math.random() - 0.5) * 0.002;
  const entryPrice = lastPrice * (1 + noise);

  const rangeBps = expectedReturnMaxBps - expectedReturnMinBps;
  const tickReturnBps = expectedReturnMinBps + Math.random() * rangeBps;
  const tickReturnPct = tickReturnBps / 10000;
  const sign = Math.random() > 0.35 ? 1 : -1;
  const pctMove = tickReturnPct * sign * (0.5 + Math.random());

  const exitPrice = entryPrice * (1 + pctMove);

  const allocatedUsdt = Number(allocatedMinor) / 10 ** USDT_DECIMALS;
  const positionSize = allocatedUsdt * (0.02 + Math.random() * 0.08);
  const qty = positionSize / entryPrice;

  const netPnl = qty * (exitPrice - entryPrice);
  const netPnlPct = pctMove * 100;

  const reasons = ["bb_upper_touch_exit", "oracle_penalized_exit", "rsi_overbought_exit", "trailing_stop_exit", "take_profit_exit"];
  const reason = reasons[Math.floor(Math.random() * reasons.length)];

  return {
    entryTs: now - Math.floor(Math.random() * 10000 + 2000),
    exitTs: now,
    entryPrice,
    exitPrice,
    qty,
    netPnl,
    netPnlPct,
    holdBars: 1,
    reason,
  };
}

async function persistTrade(
  params: { userId: string; strategyId: string; symbol: string },
  trade: TradeRecord,
): Promise<void> {
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
  }).catch(() => {});

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
  }).catch(() => {});
}

export async function runTrader(params: TraderParams): Promise<void> {
  const allocatedMinor = BigInt(params.allocatedMinor || "0");
  if (allocatedMinor <= 0n) {
    throw new Error("INVALID_ALLOCATION");
  }

  const lastCandle = params.candles[params.candles.length - 1];
  const lastPrice = lastCandle?.close ?? 0;

  if (params.liveMode) {
    const trade = generateLiveTrade(
      lastPrice,
      allocatedMinor,
      params.expectedReturnMinBps ?? 0,
      params.expectedReturnMaxBps ?? 500,
    );

    await persistTrade(
      { userId: params.userId, strategyId: params.strategyId, symbol: params.symbol },
      trade,
    );

    const tradePnlMinor = BigInt(toMinorUnits(trade.netPnl));

    const latestSnapshot = await storage.getLatestSimEquitySnapshot(params.userId, params.strategyId);
    const prevEquity = latestSnapshot ? BigInt(latestSnapshot.equityMinor) : allocatedMinor;
    const prevCumPnl = latestSnapshot ? BigInt(latestSnapshot.pnlCumMinor) : 0n;

    const newEquity = prevEquity + tradePnlMinor;
    const newCumPnl = prevCumPnl + tradePnlMinor;

    await storage.createSimEquitySnapshot({
      userId: params.userId,
      strategyId: params.strategyId,
      ts: Date.now(),
      equityMinor: newEquity.toString(),
      allocatedMinor: allocatedMinor.toString(),
      pnlCumMinor: newCumPnl.toString(),
      cashMinor: newEquity.toString(),
      positionValueMinor: "0",
      drawdownBps: 0,
    });

    try {
      const position = await storage.getPosition(params.userId, params.strategyId);
      if (position) {
        await storage.updatePosition(position.id, {
          investedCurrentMinor: newEquity.toString(),
        });
      }
    } catch {
    }

    return;
  }

  const { trades, metrics } = simulateInvestStrategy({
    candles: params.candles,
    profileSlug: params.profileSlug,
    config: params.config,
    meta: {
      symbol: params.symbol,
      timeframe: params.timeframe as import("../strategies/types").Timeframe,
    },
  });

  const minPct = (params.expectedReturnMinBps ?? 0) / 100;
  const maxPct = (params.expectedReturnMaxBps ?? 500) / 100;
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
      losses: scaledTrades.filter((t) => t.netPnl <= 0).length,
      grossPnl: scaledTrades.reduce((sum, t) => sum + Math.max(0, t.netPnl), 0),
      fees: 0,
      netPnl: scaledTrades.reduce((sum, t) => sum + t.netPnl, 0),
    },
  });

  const lastExitTs = await storage.getLatestSimTradeExitTs(params.userId, params.strategyId);
  const newTrades = lastExitTs !== null
    ? scaledTrades.filter((t) => t.exitTs > lastExitTs)
    : scaledTrades;

  for (const trade of newTrades) {
    await persistTrade(
      { userId: params.userId, strategyId: params.strategyId, symbol: params.symbol },
      trade,
    );
  }

  const netPnlMinor = BigInt(toMinorUnits(scaledStats.netPnl));
  const equityMinor = allocatedMinor + netPnlMinor;

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

  try {
    const position = await storage.getPosition(params.userId, params.strategyId);
    if (!position) return;

    const currentEquityMinor = BigInt(position.investedCurrentMinor || "0");
    const newEquityMinor = equityMinor;
    const equityDiff = currentEquityMinor > newEquityMinor 
      ? currentEquityMinor - newEquityMinor 
      : newEquityMinor - currentEquityMinor;

    const THROTTLE_MS = 30 * 1000;
    const THRESHOLD_MINOR = allocatedMinor / 1000n;
    const shouldUpdate = 
      !position.updatedAt ||
      Date.now() - position.updatedAt.getTime() > THROTTLE_MS ||
      equityDiff > THRESHOLD_MINOR;

    if (shouldUpdate) {
      await storage.updatePosition(position.id, {
        investedCurrentMinor: newEquityMinor.toString(),
      });
    }
  } catch {
  }
}
