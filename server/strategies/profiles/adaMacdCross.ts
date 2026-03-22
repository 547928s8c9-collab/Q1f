import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, ATR } from "../indicators";

class AdaMacdCrossSignal implements SignalGenerator {
  private emaFast: EMA;
  private emaSlow: EMA;
  private emaSignal: EMA;
  private atr: ATR;
  private prevHistogram: number | null = null;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(fastPeriod = 12, slowPeriod = 26, signalPeriod = 9, atrPeriod = 14) {
    this.emaFast = new EMA(fastPeriod);
    this.emaSlow = new EMA(slowPeriod);
    this.emaSignal = new EMA(signalPeriod);
    this.atr = new ATR(atrPeriod);
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const fast = this.emaFast.update(candle.close);
    const slow = this.emaSlow.update(candle.close);
    const macdLine = fast - slow;
    const signalLine = this.emaSignal.update(macdLine);
    const histogram = macdLine - signalLine;
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);

    this.lastIndicators = { macdLine, signalLine, histogram, atr, emaFast: fast, emaSlow: slow };

    if (!this.emaFast.isReady() || !this.emaSlow.isReady() || !this.emaSignal.isReady()) {
      this.prevHistogram = histogram;
      return null;
    }

    const prevHist = this.prevHistogram;
    this.prevHistogram = histogram;

    if (state.position.side === "LONG") {
      this.barsInPosition++;
      if (prevHist !== null && prevHist > 0 && histogram <= 0) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "macd_bearish_cross", indicators: this.lastIndicators };
      }
      if (this.barsInPosition > 30) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "max_hold_exit", indicators: this.lastIndicators };
      }
      return null;
    }

    if (prevHist !== null && prevHist < 0 && histogram >= 0 && macdLine > -atr * 0.5) {
      return { direction: "LONG", reason: "macd_bullish_cross", indicators: this.lastIndicators };
    }

    return null;
  }

  getIndicators(): Record<string, number> { return this.lastIndicators; }
  reset(): void {
    this.emaFast.reset(); this.emaSlow.reset(); this.emaSignal.reset(); this.atr.reset();
    this.prevHistogram = null; this.barsInPosition = 0; this.lastIndicators = {};
  }
}

export function createAdaMacdCross(config: StrategyConfig, meta: StrategyMeta): Strategy {
  return createBaseStrategy(config, meta, new AdaMacdCrossSignal());
}
