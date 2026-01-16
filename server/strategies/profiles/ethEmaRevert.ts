import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, RSI } from "../indicators";

class EthEmaRevertSignal implements SignalGenerator {
  private ema50: EMA;
  private rsi: RSI;
  private deviationThreshold: number;
  private rsiOversold: number;
  private rsiNormal: number;
  private lastIndicators: Record<string, number> = {};

  constructor(
    emaPeriod = 50,
    rsiPeriod = 14,
    deviationThreshold = 0.03,
    rsiOversold = 30,
    rsiNormal = 45
  ) {
    this.ema50 = new EMA(emaPeriod);
    this.rsi = new RSI(rsiPeriod);
    this.deviationThreshold = deviationThreshold;
    this.rsiOversold = rsiOversold;
    this.rsiNormal = rsiNormal;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const ema = this.ema50.update(candle.close);
    const rsi = this.rsi.update(candle.close);

    const deviation = ema > 0 ? (candle.close - ema) / ema : 0;

    this.lastIndicators = {
      ema50: ema,
      rsi,
      deviation,
      price: candle.close,
    };

    if (!this.ema50.isReady() || !this.rsi.isReady()) {
      return null;
    }

    if (state.position.side === "LONG") {
      if (candle.close >= ema) {
        return {
          direction: "EXIT",
          reason: "ema_reversion_complete",
          indicators: this.lastIndicators,
        };
      }

      if (rsi > this.rsiNormal) {
        return {
          direction: "EXIT",
          reason: "rsi_normalized",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (deviation < -this.deviationThreshold && rsi < this.rsiOversold) {
      return {
        direction: "LONG",
        reason: "ema_deviation_rsi_oversold",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.ema50.reset();
    this.rsi.reset();
    this.lastIndicators = {};
  }
}

export function createEthEmaRevert(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new EthEmaRevertSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
