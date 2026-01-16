import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { KeltnerChannel, VolumeMA, RSI } from "../indicators";

class XrpKeltnerRevertSignal implements SignalGenerator {
  private keltner: KeltnerChannel;
  private volumeMA: VolumeMA;
  private rsi: RSI;
  private volumeBreakoutThreshold: number;
  private lastIndicators: Record<string, number> = {};

  constructor(
    emaPeriod = 20,
    atrPeriod = 10,
    keltnerMultiplier = 2.0,
    volumePeriod = 20,
    rsiPeriod = 14,
    volumeBreakoutThreshold = 1.5
  ) {
    this.keltner = new KeltnerChannel(emaPeriod, atrPeriod, keltnerMultiplier);
    this.volumeMA = new VolumeMA(volumePeriod);
    this.rsi = new RSI(rsiPeriod);
    this.volumeBreakoutThreshold = volumeBreakoutThreshold;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const kc = this.keltner.updateHLC(candle.high, candle.low, candle.close);
    const volumeAvg = this.volumeMA.update(candle.volume);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);
    const rsi = this.rsi.update(candle.close);

    this.lastIndicators = {
      kcMiddle: kc.middle,
      kcUpper: kc.upper,
      kcLower: kc.lower,
      volumeAvg,
      relVol,
      rsi,
    };

    if (!this.keltner.isReady() || !this.volumeMA.isReady()) {
      return null;
    }

    if (state.position.side === "LONG") {
      if (candle.close >= kc.middle) {
        return {
          direction: "EXIT",
          reason: "keltner_midline_revert",
          indicators: this.lastIndicators,
        };
      }

      if (candle.close >= kc.upper) {
        return {
          direction: "EXIT",
          reason: "keltner_upper_touch",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    const touchesLower = candle.low <= kc.lower;
    const notBreakout = relVol < this.volumeBreakoutThreshold;

    if (touchesLower && notBreakout && rsi < 35) {
      return {
        direction: "LONG",
        reason: "keltner_lower_touch_no_breakout",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.keltner.reset();
    this.volumeMA.reset();
    this.rsi.reset();
    this.lastIndicators = {};
  }
}

export function createXrpKeltnerRevert(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new XrpKeltnerRevertSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
