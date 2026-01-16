import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, RSI, ATR } from "../indicators";

class AdaDeepRevertSignal implements SignalGenerator {
  private ema200: EMA;
  private rsi: RSI;
  private atr: ATR;
  private deviationThreshold: number;
  private rsiOversold: number;
  private partialRevertThreshold: number;
  private lastIndicators: Record<string, number> = {};

  constructor(
    emaPeriod = 200,
    rsiPeriod = 14,
    atrPeriod = 14,
    deviationThreshold = 0.08,
    rsiOversold = 25,
    partialRevertThreshold = 0.04
  ) {
    this.ema200 = new EMA(emaPeriod);
    this.rsi = new RSI(rsiPeriod);
    this.atr = new ATR(atrPeriod);
    this.deviationThreshold = deviationThreshold;
    this.rsiOversold = rsiOversold;
    this.partialRevertThreshold = partialRevertThreshold;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const ema = this.ema200.update(candle.close);
    const rsi = this.rsi.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);

    const deviation = ema > 0 ? (candle.close - ema) / ema : 0;

    this.lastIndicators = {
      ema200: ema,
      rsi,
      atr,
      deviation,
    };

    if (!this.ema200.isReady() || !this.rsi.isReady()) {
      return null;
    }

    if (state.position.side === "LONG") {
      if (candle.close >= ema) {
        return {
          direction: "EXIT",
          reason: "full_revert_to_ema200",
          indicators: this.lastIndicators,
        };
      }

      if (Math.abs(deviation) <= this.partialRevertThreshold) {
        return {
          direction: "EXIT",
          reason: "partial_revert_to_ema200",
          indicators: this.lastIndicators,
        };
      }

      if (rsi > 55) {
        return {
          direction: "EXIT",
          reason: "rsi_recovery_exit",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (deviation < -this.deviationThreshold && rsi < this.rsiOversold) {
      return {
        direction: "LONG",
        reason: "deep_deviation_ema200_rsi_oversold",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.ema200.reset();
    this.rsi.reset();
    this.atr.reset();
    this.lastIndicators = {};
  }
}

export function createAdaDeepRevert(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new AdaDeepRevertSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
