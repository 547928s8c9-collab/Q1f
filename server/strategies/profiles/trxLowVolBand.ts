import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { BollingerBands, ATR, SMA } from "../indicators";

class TrxLowVolBandSignal implements SignalGenerator {
  private bb: BollingerBands;
  private atr: ATR;
  private atrSma: SMA;
  private atrThreshold: number;
  private targetBps: number;
  private entryPrice: number | null = null;
  private lastIndicators: Record<string, number> = {};

  constructor(
    bbPeriod = 20,
    bbStdDev = 2,
    atrPeriod = 14,
    atrSmaPeriod = 50,
    atrThreshold = 0.7,
    targetBps = 30
  ) {
    this.bb = new BollingerBands(bbPeriod, bbStdDev);
    this.atr = new ATR(atrPeriod);
    this.atrSma = new SMA(atrSmaPeriod);
    this.atrThreshold = atrThreshold;
    this.targetBps = targetBps;
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const bb = this.bb.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    const atrAvg = this.atrSma.update(atr);

    const isLowVol = atrAvg > 0 && atr / atrAvg < this.atrThreshold;
    const touchesLower = candle.low <= bb.lower;
    const touchesUpper = candle.high >= bb.upper;

    this.lastIndicators = {
      bbMiddle: bb.middle,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      bandwidth: bb.bandwidth,
      atr,
      atrAvg,
      isLowVol: isLowVol ? 1 : 0,
    };

    if (!this.bb.isReady() || !this.atr.isReady() || !this.atrSma.isReady()) {
      return null;
    }

    if (state.position.side === "LONG" && this.entryPrice !== null) {
      const targetPrice = this.entryPrice * (1 + this.targetBps / 10000);

      if (candle.close >= bb.middle) {
        this.entryPrice = null;
        return {
          direction: "EXIT",
          reason: "mean_reversion_complete",
          indicators: this.lastIndicators,
        };
      }

      if (candle.close >= targetPrice) {
        this.entryPrice = null;
        return {
          direction: "EXIT",
          reason: "small_target_hit",
          indicators: this.lastIndicators,
        };
      }

      return null;
    }

    if (isLowVol && touchesLower && state.position.side === "FLAT") {
      this.entryPrice = candle.close;
      return {
        direction: "LONG",
        reason: "low_vol_regime_lower_band_touch",
        indicators: this.lastIndicators,
      };
    }

    return null;
  }

  getIndicators(): Record<string, number> {
    return this.lastIndicators;
  }

  reset(): void {
    this.bb.reset();
    this.atr.reset();
    this.atrSma.reset();
    this.entryPrice = null;
    this.lastIndicators = {};
  }
}

export function createTrxLowVolBand(config: StrategyConfig, meta: StrategyMeta): Strategy {
  const signalGenerator = new TrxLowVolBandSignal();
  return createBaseStrategy(config, meta, signalGenerator);
}
