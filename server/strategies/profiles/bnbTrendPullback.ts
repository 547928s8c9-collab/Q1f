import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, Slope, ATR } from "../indicators";

class BnbTrendPullbackSignal implements SignalGenerator {
  private ema20: EMA;
  private ema50: EMA;
  private emaSlope: Slope;
  private atr: ATR;
  private takeProfitMultiplier: number;
  private pullbackThreshold: number;
  private entryPrice: number | null = null;
  private lastIndicators: Record<string, number> = {};

  constructor(
    ema20Period = 20,
    ema50Period = 50,
    slopePeriod = 5,
    atrPeriod = 14,
    takeProfitMultiplier = 2.0,
    pullbackThreshold = 0.005
  ) {
    this.ema20 = new EMA(ema20Period);
    this.ema50 = new EMA(ema50Period);
    this.emaSlope = new Slope(slopePeriod);
    this.atr = new ATR(atrPeriod);
    this.takeProfitMultiplier = takeProfitMultiplier;
    this.pullbackThreshold = pullbackThreshold;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const ema20 = this.ema20.update(candle.close);
    const ema50 = this.ema50.update(candle.close);
    const slope = this.emaSlope.update(ema50);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);

    const priceToEma20Dist = ema20 > 0 ? (candle.close - ema20) / ema20 : 0;
    const isUptrend = slope > 0 && candle.close > ema50;
    const isPullback = priceToEma20Dist < this.pullbackThreshold && priceToEma20Dist > -0.02;

    this.lastIndicators = {
      ema20,
      ema50,
      slope,
      atr,
      priceToEma20Dist,
      isUptrend: isUptrend ? 1 : 0,
      isPullback: isPullback ? 1 : 0,
    };

    if (!this.ema20.isReady() || !this.ema50.isReady() || !this.emaSlope.isReady()) {
      return null;
    }

    if (state.position.side === "LONG" && this.entryPrice !== null) {
      const takeProfitLevel = this.entryPrice + atr * this.takeProfitMultiplier;

      if (candle.close >= takeProfitLevel) {
        this.entryPrice = null;
        return {
          direction: "EXIT",
          reason: "take_profit_atr_target",
          indicators: this.lastIndicators,
        };
      }

      if (slope < 0 || candle.close < ema50) {
        this.entryPrice = null;
        return {
          direction: "EXIT",
          reason: "trend_break",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (isUptrend && isPullback && state.position.side === "FLAT") {
      this.entryPrice = candle.close;
      return {
        direction: "LONG",
        reason: "uptrend_ema20_pullback",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.ema20.reset();
    this.ema50.reset();
    this.emaSlope.reset();
    this.atr.reset();
    this.entryPrice = null;
    this.lastIndicators = {};
  }
}

export function createBnbTrendPullback(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new BnbTrendPullbackSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
