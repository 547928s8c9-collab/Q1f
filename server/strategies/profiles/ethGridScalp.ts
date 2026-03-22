import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, ATR, VolumeMA } from "../indicators";

class EthGridScalpSignal implements SignalGenerator {
  private emaFast: EMA;
  private emaSlow: EMA;
  private atr: ATR;
  private volumeMA: VolumeMA;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(fastPeriod = 8, slowPeriod = 21, atrPeriod = 14, volPeriod = 20) {
    this.emaFast = new EMA(fastPeriod);
    this.emaSlow = new EMA(slowPeriod);
    this.atr = new ATR(atrPeriod);
    this.volumeMA = new VolumeMA(volPeriod);
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const fast = this.emaFast.update(candle.close);
    const slow = this.emaSlow.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    this.volumeMA.update(candle.volume);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);
    const emaDiff = slow > 0 ? (fast - slow) / slow * 100 : 0;

    this.lastIndicators = { emaFast: fast, emaSlow: slow, atr, relVol, emaDiff };

    if (!this.emaFast.isReady() || !this.emaSlow.isReady()) return null;

    if (state.position.side === "LONG") {
      this.barsInPosition++;
      if (emaDiff > 0.4 || this.barsInPosition > 16) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "grid_target_hit", indicators: this.lastIndicators };
      }
      if (candle.close < slow - atr * 1.5) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "grid_stop_loss", indicators: this.lastIndicators };
      }
      return null;
    }

    if (emaDiff < -0.2 && relVol > 1.1 && candle.close > slow - atr) {
      return { direction: "LONG", reason: "grid_level_entry", indicators: this.lastIndicators };
    }

    return null;
  }

  getIndicators(): Record<string, number> { return this.lastIndicators; }
  reset(): void {
    this.emaFast.reset(); this.emaSlow.reset(); this.atr.reset(); this.volumeMA.reset();
    this.barsInPosition = 0; this.lastIndicators = {};
  }
}

export function createEthGridScalp(config: StrategyConfig, meta: StrategyMeta): Strategy {
  return createBaseStrategy(config, meta, new EthGridScalpSignal());
}
