import type { Candle as BaseCandle } from "@shared/schema";

export type { Candle } from "@shared/schema";
export type Timeframe = "15m" | "1h";

export const STRATEGY_PROFILE_SLUGS = [
  "btc_squeeze_breakout",
  "eth_ema_revert",
  "bnb_trend_pullback",
  "sol_vol_burst",
  "xrp_keltner_revert",
  "doge_fast_momo",
  "ada_deep_revert",
  "trx_lowvol_band",
] as const;

export type StrategyProfileSlug = typeof STRATEGY_PROFILE_SLUGS[number];

export interface WalkForwardConfig {
  enabled: boolean;
  lookbackBars: number;
  recalibEveryBars: number;
  minWinProb: number;
  minEVBps: number;
}

export interface OracleExitConfig {
  enabled: boolean;
  horizonBars: number;
  penaltyBps: number;
  maxHoldBars: number;
}

export interface StrategyConfig {
  feesBps: number;
  slippageBps: number;
  maxPositionPct: number;
  minBarsWarmup: number;
  walkForward: WalkForwardConfig;
  oracleExit: OracleExitConfig;
}

export interface StrategyMeta {
  symbol: string;
  timeframe: Timeframe;
}

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET";
export type OrderStatus = "PENDING" | "FILLED" | "CANCELLED";

export interface Order {
  id: string;
  side: OrderSide;
  type: OrderType;
  qty: number;
  status: OrderStatus;
  createdTs: number;
  createdBarIndex: number;
  filledTs?: number;
  filledPrice?: number;
  oraclePenalizedPrice?: number;
  reason: string;
}

export interface Position {
  side: "LONG" | "FLAT";
  qty: number;
  entryPrice: number;
  entryTs: number;
  entryBarIndex: number;
}

export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
}

export interface StrategyState {
  barIndex: number;
  cash: number;
  position: Position;
  equity: number;
  openOrders: Order[];
  stats: TradeStats;
  rollingWins: number[];
  rollingPnls: number[];
}

export type EventType = "candle" | "signal" | "order" | "fill" | "trade" | "equity" | "status";

export interface CandlePayload {
  candle: BaseCandle;
  barIndex: number;
}

export interface SignalPayload {
  direction: "LONG" | "EXIT" | "NONE";
  reason: string;
  indicators: Record<string, number>;
}

export interface OrderPayload {
  order: Order;
}

export interface FillPayload {
  orderId: string;
  side: OrderSide;
  qty: number;
  price: number;
  fees: number;
  slippage: number;
  reason: string;
}

export interface TradePayload {
  side: "LONG";
  entryPrice: number;
  exitPrice: number;
  qty: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  holdBars: number;
  reason: string;
}

export interface EquityPayload {
  cash: number;
  positionValue: number;
  equity: number;
  drawdownPct: number;
}

export interface StatusPayload {
  message: string;
  level: "info" | "warn" | "error";
}

export type EventPayload =
  | { type: "candle"; data: CandlePayload }
  | { type: "signal"; data: SignalPayload }
  | { type: "order"; data: OrderPayload }
  | { type: "fill"; data: FillPayload }
  | { type: "trade"; data: TradePayload }
  | { type: "equity"; data: EquityPayload }
  | { type: "status"; data: StatusPayload };

export interface StrategyEvent {
  ts: number;
  seq: number;
  payload: EventPayload;
}

export interface Strategy {
  onCandle(candle: BaseCandle, futureCandles?: BaseCandle[]): StrategyEvent[];
  getState(): StrategyState;
  setState(state: StrategyState): void;
  reset(): void;
}

export type StrategyFactory = (
  config: StrategyConfig,
  meta: StrategyMeta
) => Strategy;
