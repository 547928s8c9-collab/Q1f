import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, VolumeMA, ATR } from "../indicators";

class DogeFastMomoSignal implements SignalGenerator {
  private ema9: EMA;
  private ema21: EMA;
  private volumeMA: VolumeMA;
  private atr: ATR;
  private volumeMultiplier: number;
  private prevEma9: number | null = null;
  private prevEma21: number | null = null;
  private barsInPosition = 0;
  private maxHoldBars: number;
  private lastIndicators: Record<string, number> = {};

  constructor(
    ema9Period = 9,
    ema21Period = 21,
    volumePeriod = 20,
    atrPeriod = 14,
    volumeMultiplier = 1.3,
    maxHoldBars = 6
  ) {
    this.ema9 = new EMA(ema9Period);
    this.ema21 = new EMA(ema21Period);
    this.volumeMA = new VolumeMA(volumePeriod);
    this.atr = new ATR(atrPeriod);
    this.volumeMultiplier = volumeMultiplier;
    this.maxHoldBars = maxHoldBars;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const ema9 = this.ema9.update(candle.close);
    const ema21 = this.ema21.update(candle.close);
    const volumeAvg = this.volumeMA.update(candle.volume);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);

    const crossUp =
      this.prevEma9 !== null &&
      this.prevEma21 !== null &&
      this.prevEma9 <= this.prevEma21 &&
      ema9 > ema21;

    const crossDown =
      this.prevEma9 !== null &&
      this.prevEma21 !== null &&
      this.prevEma9 >= this.prevEma21 &&
      ema9 < ema21;

    this.lastIndicators = {
      ema9,
      ema21,
      volumeAvg,
      relVol,
      atr,
      crossUp: crossUp ? 1 : 0,
      crossDown: crossDown ? 1 : 0,
    };

    this.prevEma9 = ema9;
    this.prevEma21 = ema21;

    if (!this.ema9.isReady() || !this.ema21.isReady() || !this.volumeMA.isReady()) {
      return null;
    }

    if (state.position.side === "LONG") {
      this.barsInPosition++;

      if (this.barsInPosition >= this.maxHoldBars) {
        this.barsInPosition = 0;
        return {
          direction: "EXIT",
          reason: "fast_momo_max_hold",
          indicators: this.lastIndicators,
        };
      }

      if (crossDown) {
        this.barsInPosition = 0;
        return {
          direction: "EXIT",
          reason: "ema_cross_down",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (crossUp && relVol > this.volumeMultiplier) {
      this.barsInPosition = 0;
      return {
        direction: "LONG",
        reason: "ema_9_21_cross_volume_confirm",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.ema9.reset();
    this.ema21.reset();
    this.volumeMA.reset();
    this.atr.reset();
    this.prevEma9 = null;
    this.prevEma21 = null;
    this.barsInPosition = 0;
    this.lastIndicators = {};
  }
}

export function createDogeFastMomo(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new DogeFastMomoSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
