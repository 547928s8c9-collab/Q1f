import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, RSI, ATR, VolumeMA } from "../indicators";

class BtcLevMomentumSignal implements SignalGenerator {
  private emaFast: EMA;
  private emaSlow: EMA;
  private rsi: RSI;
  private atr: ATR;
  private volumeMA: VolumeMA;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(fastPeriod = 9, slowPeriod = 21, rsiPeriod = 14, atrPeriod = 14, volPeriod = 20) {
    this.emaFast = new EMA(fastPeriod);
    this.emaSlow = new EMA(slowPeriod);
    this.rsi = new RSI(rsiPeriod);
    this.atr = new ATR(atrPeriod);
    this.volumeMA = new VolumeMA(volPeriod);
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const fast = this.emaFast.update(candle.close);
    const slow = this.emaSlow.update(candle.close);
    const rsi = this.rsi.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    this.volumeMA.update(candle.volume);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);
    const momentum = slow > 0 ? (fast - slow) / slow * 100 : 0;

    this.lastIndicators = { emaFast: fast, emaSlow: slow, rsi, atr, relVol, momentum };

    if (!this.emaFast.isReady() || !this.rsi.isReady()) return null;

    if (state.position.side === "LONG") {
      this.barsInPosition++;
      if (rsi > 78 || momentum < 0.1) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "momentum_exhaustion", indicators: this.lastIndicators };
      }
      if (candle.close < slow - atr * 2) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "hard_stop_loss", indicators: this.lastIndicators };
      }
      return null;
    }

    if (momentum > 0.3 && rsi > 55 && rsi < 72 && relVol > 1.3) {
      return { direction: "LONG", reason: "leveraged_momentum_entry", indicators: this.lastIndicators };
    }

    return null;
  }

  getIndicators(): Record<string, number> { return this.lastIndicators; }
  reset(): void {
    this.emaFast.reset(); this.emaSlow.reset(); this.rsi.reset(); this.atr.reset(); this.volumeMA.reset();
    this.barsInPosition = 0; this.lastIndicators = {};
  }
}

export function createBtcLevMomentum(config: StrategyConfig, meta: StrategyMeta): Strategy {
  return createBaseStrategy(config, meta, new BtcLevMomentumSignal());
}
