import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { ReturnPercentile, VolumeMA, ATR } from "../indicators";

class SolVolBurstSignal implements SignalGenerator {
  private returnPercentile: ReturnPercentile;
  private volumeMA: VolumeMA;
  private atr: ATR;
  private returnThreshold: number;
  private volumeMultiplier: number;
  private maxHoldBars: number;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(
    percentilePeriod = 100,
    volumePeriod = 20,
    atrPeriod = 14,
    returnThreshold = 0.85,
    volumeMultiplier = 2.0,
    maxHoldBars = 8
  ) {
    this.returnPercentile = new ReturnPercentile(percentilePeriod);
    this.volumeMA = new VolumeMA(volumePeriod);
    this.atr = new ATR(atrPeriod);
    this.returnThreshold = returnThreshold;
    this.volumeMultiplier = volumeMultiplier;
    this.maxHoldBars = maxHoldBars;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const percentile = this.returnPercentile.update(candle.close);
    const volumeAvg = this.volumeMA.update(candle.volume);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);

    this.lastIndicators = {
      returnPercentile: percentile,
      volumeAvg,
      relVol,
      atr,
    };

    if (!this.returnPercentile.isReady() || !this.volumeMA.isReady()) {
      return null;
    }

    if (state.position.side === "LONG") {
      this.barsInPosition++;

      if (this.barsInPosition >= this.maxHoldBars) {
        this.barsInPosition = 0;
        return {
          direction: "EXIT",
          reason: "vol_burst_max_hold_exit",
          indicators: this.lastIndicators,
        };
      }

      if (percentile < 0.5 && this.barsInPosition >= 2) {
        this.barsInPosition = 0;
        return {
          direction: "EXIT",
          reason: "momentum_fade_exit",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (percentile > this.returnThreshold && relVol > this.volumeMultiplier) {
      this.barsInPosition = 0;
      return {
        direction: "LONG",
        reason: "return_percentile_volume_burst",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.returnPercentile.reset();
    this.volumeMA.reset();
    this.atr.reset();
    this.barsInPosition = 0;
    this.lastIndicators = {};
  }
}

export function createSolVolBurst(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new SolVolBurstSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
