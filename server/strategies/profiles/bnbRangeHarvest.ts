import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { SMA, ATR, RSI } from "../indicators";

class BnbRangeHarvestSignal implements SignalGenerator {
  private sma: SMA;
  private atr: ATR;
  private rsi: RSI;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(smaPeriod = 30, atrPeriod = 14, rsiPeriod = 14) {
    this.sma = new SMA(smaPeriod);
    this.atr = new ATR(atrPeriod);
    this.rsi = new RSI(rsiPeriod);
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const sma = this.sma.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    const rsi = this.rsi.update(candle.close);
    const distFromSma = sma > 0 ? (candle.close - sma) / sma * 100 : 0;

    this.lastIndicators = { sma, atr, rsi, distFromSma };

    if (!this.sma.isReady() || !this.rsi.isReady()) return null;

    if (state.position.side === "LONG") {
      this.barsInPosition++;
      if (distFromSma > 0.8 || rsi > 65 || this.barsInPosition > 20) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "range_upper_exit", indicators: this.lastIndicators };
      }
      return null;
    }

    if (distFromSma < -0.6 && rsi < 40 && atr < candle.close * 0.008) {
      return { direction: "LONG", reason: "range_lower_entry", indicators: this.lastIndicators };
    }

    return null;
  }

  getIndicators(): Record<string, number> { return this.lastIndicators; }
  reset(): void {
    this.sma.reset(); this.atr.reset(); this.rsi.reset();
    this.barsInPosition = 0; this.lastIndicators = {};
  }
}

export function createBnbRangeHarvest(config: StrategyConfig, meta: StrategyMeta): Strategy {
  return createBaseStrategy(config, meta, new BnbRangeHarvestSignal());
}
