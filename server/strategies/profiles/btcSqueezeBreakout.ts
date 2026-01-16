import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { BollingerBands, VolumeMA, ATR } from "../indicators";

class BtcSqueezeBreakoutSignal implements SignalGenerator {
  private bb: BollingerBands;
  private volumeMA: VolumeMA;
  private atr: ATR;
  private squeezeThreshold: number;
  private volumeMultiplier: number;
  private prevBandwidth: number | null = null;
  private inSqueeze = false;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(
    bbPeriod = 20,
    bbStdDev = 2,
    volumePeriod = 20,
    atrPeriod = 14,
    squeezeThreshold = 0.03,
    volumeMultiplier = 1.5
  ) {
    this.bb = new BollingerBands(bbPeriod, bbStdDev);
    this.volumeMA = new VolumeMA(volumePeriod);
    this.atr = new ATR(atrPeriod);
    this.squeezeThreshold = squeezeThreshold;
    this.volumeMultiplier = volumeMultiplier;
  }

  onCandle(candle: Candle, state: StrategyState, _futureCandles?: Candle[]): SignalPayload | null {
    const bb = this.bb.update(candle.close);
    const volumeAvg = this.volumeMA.update(candle.volume);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);

    this.lastIndicators = {
      bbMiddle: bb.middle,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      bandwidth: bb.bandwidth,
      percentB: bb.percentB,
      volumeAvg,
      relVol,
      atr,
    };

    if (!this.bb.isReady() || !this.volumeMA.isReady()) {
      return null;
    }

    const wasSqueeze = this.inSqueeze;
    this.inSqueeze = bb.bandwidth < this.squeezeThreshold;

    if (state.position.side === "LONG") {
      this.barsInPosition++;

      if (candle.close < bb.middle) {
        this.barsInPosition = 0;
        return {
          direction: "EXIT",
          reason: "bb_middle_cross_down",
          indicators: this.lastIndicators,
        };
      }

      if (bb.percentB > 0.95) {
        this.barsInPosition = 0;
        return {
          direction: "EXIT",
          reason: "bb_upper_touch_exit",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (wasSqueeze && !this.inSqueeze) {
      if (candle.close > bb.upper && relVol > this.volumeMultiplier) {
        return {
          direction: "LONG",
          reason: "squeeze_breakout_volume_confirm",
          indicators: this.lastIndicators,
        };
      }
    }

    if (this.prevBandwidth !== null && bb.bandwidth > this.prevBandwidth * 1.2) {
      if (candle.close > bb.upper && relVol > this.volumeMultiplier) {
        return {
          direction: "LONG",
          reason: "bandwidth_expansion_breakout",
          indicators: this.lastIndicators,
        };
      }
    }

    this.prevBandwidth = bb.bandwidth;
    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.bb.reset();
    this.volumeMA.reset();
    this.atr.reset();
    this.prevBandwidth = null;
    this.inSqueeze = false;
    this.barsInPosition = 0;
    this.lastIndicators = {};
  }
}

export function createBtcSqueezeBreakout(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new BtcSqueezeBreakoutSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
