import type { Candle } from "@shared/schema";
import type {
  Strategy,
  StrategyConfig,
  StrategyMeta,
  StrategyState,
  StrategyEvent,
  Order,
  SignalPayload,
} from "./types";

export interface SignalGenerator {
  onCandle(
    candle: Candle,
    state: StrategyState,
    futureCandles?: Candle[]
  ): SignalPayload | null;
  reset(): void;
  getIndicators(): Record<string, number>;
}

export function createBaseStrategy(
  config: StrategyConfig,
  _meta: StrategyMeta,
  signalGenerator: SignalGenerator
): Strategy {
  let seq = 0;
  let state: StrategyState = createInitialState();
  let peakEquity = state.equity;

  function createInitialState(): StrategyState {
    return {
      barIndex: 0,
      cash: 10000,
      position: { side: "FLAT", qty: 0, entryPrice: 0, entryTs: 0, entryBarIndex: 0 },
      equity: 10000,
      openOrders: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, grossPnl: 0, fees: 0, netPnl: 0 },
      rollingWins: [],
      rollingPnls: [],
    };
  }

  function nextSeq(): number {
    return ++seq;
  }

  function calcSlippage(price: number, side: "BUY" | "SELL"): number {
    const slippagePct = config.slippageBps / 10000;
    return side === "BUY" ? price * (1 + slippagePct) : price * (1 - slippagePct);
  }

  function calcFees(notional: number): number {
    return notional * (config.feesBps / 10000);
  }

  function getRollingWinProb(): number {
    if (state.rollingWins.length < 10) return 0.5;
    const wins = state.rollingWins.reduce((a, b) => a + b, 0);
    return wins / state.rollingWins.length;
  }

  function getRollingEVBps(): number {
    if (state.rollingPnls.length < 10) return 0;
    const avgPnl = state.rollingPnls.reduce((a, b) => a + b, 0) / state.rollingPnls.length;
    return avgPnl * 10000;
  }

  function passesWalkForwardFilter(): boolean {
    if (!config.walkForward.enabled) return true;
    if (state.stats.totalTrades < 10) return true;

    const winProb = getRollingWinProb();
    const evBps = getRollingEVBps();

    return winProb >= config.walkForward.minWinProb && evBps >= config.walkForward.minEVBps;
  }

  function findOracleExit(
    entryPrice: number,
    futureCandles: Candle[]
  ): { exitBar: number; exitPrice: number; reason: string } | null {
    if (!config.oracleExit.enabled || futureCandles.length === 0) return null;

    const horizon = Math.min(config.oracleExit.horizonBars, futureCandles.length);
    let bestBar = 0;
    let bestPrice = futureCandles[0].close;
    let bestPnl = bestPrice - entryPrice;

    for (let i = 0; i < horizon; i++) {
      const c = futureCandles[i];
      const pnl = c.high - entryPrice;
      if (pnl > bestPnl) {
        bestPnl = pnl;
        bestPrice = c.high;
        bestBar = i + 1;
      }
    }

    const penaltyPct = config.oracleExit.penaltyBps / 10000;
    const penalizedPrice = bestPrice * (1 - penaltyPct);

    return {
      exitBar: bestBar,
      exitPrice: penalizedPrice,
      reason: "oracle_penalized_exit",
    };
  }

  function onCandle(candle: Candle, futureCandles?: Candle[]): StrategyEvent[] {
    const events: StrategyEvent[] = [];
    const ts = candle.ts;
    state.barIndex++;

    events.push({
      ts,
      seq: nextSeq(),
      payload: {
        type: "candle",
        data: { candle, barIndex: state.barIndex },
      },
    });

    const ordersToFill = state.openOrders.filter(
      (o) => o.status === "PENDING" && o.createdBarIndex < state.barIndex
    );

    for (const order of ordersToFill) {
      let fillPrice: number;

      if (order.oraclePenalizedPrice !== undefined) {
        fillPrice = order.oraclePenalizedPrice;
      } else {
        fillPrice = calcSlippage(candle.open, order.side);
      }

      const fees = calcFees(fillPrice * order.qty);

      order.status = "FILLED";
      order.filledTs = ts;
      order.filledPrice = fillPrice;

      events.push({
        ts,
        seq: nextSeq(),
        payload: {
          type: "fill",
          data: {
            orderId: order.id,
            side: order.side,
            qty: order.qty,
            price: fillPrice,
            fees,
            slippage: Math.abs(fillPrice - candle.open),
            reason: order.reason,
          },
        },
      });

      if (order.side === "BUY") {
        state.cash -= fillPrice * order.qty + fees;
        state.position = {
          side: "LONG",
          qty: order.qty,
          entryPrice: fillPrice,
          entryTs: ts,
          entryBarIndex: state.barIndex,
        };
        state.stats.fees += fees;
      } else if (order.side === "SELL" && state.position.side === "LONG") {
        const entryPrice = state.position.entryPrice;
        const exitPrice = fillPrice;
        const qty = state.position.qty;
        const grossPnl = (exitPrice - entryPrice) * qty;
        const netPnl = grossPnl - fees;

        state.cash += exitPrice * qty - fees;
        state.stats.totalTrades++;
        state.stats.grossPnl += grossPnl;
        state.stats.fees += fees;
        state.stats.netPnl += netPnl;

        const holdBars = state.barIndex - state.position.entryBarIndex;

        if (netPnl > 0) {
          state.stats.wins++;
          state.rollingWins.push(1);
        } else {
          state.stats.losses++;
          state.rollingWins.push(0);
        }

        state.rollingPnls.push(netPnl / (entryPrice * qty));

        if (state.rollingWins.length > config.walkForward.lookbackBars) {
          state.rollingWins.shift();
          state.rollingPnls.shift();
        }

        events.push({
          ts,
          seq: nextSeq(),
          payload: {
            type: "trade",
            data: {
              side: "LONG",
              entryPrice,
              exitPrice,
              qty,
              grossPnl,
              fees,
              netPnl,
              holdBars,
              reason: order.reason,
            },
          },
        });

        state.position = { side: "FLAT", qty: 0, entryPrice: 0, entryTs: 0, entryBarIndex: 0 };
      }
    }

    state.openOrders = state.openOrders.filter((o) => o.status === "PENDING");

    if (state.barIndex < config.minBarsWarmup) {
      signalGenerator.onCandle(candle, state, futureCandles);
      return events;
    }

    const signal = signalGenerator.onCandle(candle, state, futureCandles);

    if (signal) {
      events.push({
        ts,
        seq: nextSeq(),
        payload: {
          type: "signal",
          data: signal,
        },
      });

      if (signal.direction === "LONG" && state.position.side === "FLAT") {
        if (passesWalkForwardFilter()) {
          const positionSize = (state.cash * config.maxPositionPct) / candle.close;
          const order: Order = {
            id: `ORD-${state.barIndex}-BUY`,
            side: "BUY",
            type: "MARKET",
            qty: positionSize,
            status: "PENDING",
            createdTs: ts,
            createdBarIndex: state.barIndex,
            reason: signal.reason,
          };

          state.openOrders.push(order);

          events.push({
            ts,
            seq: nextSeq(),
            payload: {
              type: "order",
              data: { order },
            },
          });
        } else {
          events.push({
            ts,
            seq: nextSeq(),
            payload: {
              type: "status",
              data: {
                message: `Signal filtered by walk-forward: winProb=${getRollingWinProb().toFixed(2)}, EV=${getRollingEVBps().toFixed(0)}bps`,
                level: "info",
              },
            },
          });
        }
      } else if (signal.direction === "EXIT" && state.position.side === "LONG") {
        let exitReason = signal.reason;
        let oraclePenalizedPrice: number | undefined;

        if (config.oracleExit.enabled && futureCandles && futureCandles.length > 0) {
          const oracleResult = findOracleExit(state.position.entryPrice, futureCandles);
          if (oracleResult && oracleResult.exitPrice > candle.close) {
            exitReason = oracleResult.reason;
            oraclePenalizedPrice = oracleResult.exitPrice;
          }
        }

        const order: Order = {
          id: `ORD-${state.barIndex}-SELL`,
          side: "SELL",
          type: "MARKET",
          qty: state.position.qty,
          status: "PENDING",
          createdTs: ts,
          createdBarIndex: state.barIndex,
          oraclePenalizedPrice,
          reason: exitReason,
        };

        state.openOrders.push(order);

        events.push({
          ts,
          seq: nextSeq(),
          payload: {
            type: "order",
            data: { order },
          },
        });
      }
    }

    if (state.position.side === "LONG") {
      const holdBars = state.barIndex - state.position.entryBarIndex;

      if (config.oracleExit.maxHoldBars > 0 && holdBars >= config.oracleExit.maxHoldBars) {
        if (state.openOrders.every((o) => o.side !== "SELL")) {
          const order: Order = {
            id: `ORD-${state.barIndex}-SELL-MAXHOLD`,
            side: "SELL",
            type: "MARKET",
            qty: state.position.qty,
            status: "PENDING",
            createdTs: ts,
            createdBarIndex: state.barIndex,
            reason: "max_hold_bars_reached",
          };

          state.openOrders.push(order);

          events.push({
            ts,
            seq: nextSeq(),
            payload: {
              type: "order",
              data: { order },
            },
          });
        }
      }
    }

    const positionValue =
      state.position.side === "LONG" ? state.position.qty * candle.close : 0;
    state.equity = state.cash + positionValue;

    if (state.equity > peakEquity) {
      peakEquity = state.equity;
    }

    const drawdownPct = peakEquity > 0 ? ((peakEquity - state.equity) / peakEquity) * 100 : 0;

    events.push({
      ts,
      seq: nextSeq(),
      payload: {
        type: "equity",
        data: {
          cash: state.cash,
          positionValue,
          equity: state.equity,
          drawdownPct,
        },
      },
    });

    return events;
  }

  function getState(): StrategyState {
    return { ...state };
  }

  function reset(): void {
    seq = 0;
    state = createInitialState();
    peakEquity = state.equity;
    signalGenerator.reset();
  }

  return { onCandle, getState, reset };
}
