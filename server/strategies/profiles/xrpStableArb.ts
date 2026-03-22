import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { SMA, ATR } from "../indicators";

class XrpStableArbSignal implements SignalGenerator {
  private smaFast: SMA;
  private smaSlow: SMA;
  private atr: ATR;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(fastPeriod = 10, slowPeriod = 40, atrPeriod = 14) {
    this.smaFast = new SMA(fastPeriod);
    this.smaSlow = new SMA(slowPeriod);
    this.atr = new ATR(atrPeriod);
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const fast = this.smaFast.update(candle.close);
    const slow = this.smaSlow.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    const spread = fast - slow;
    const spreadPct = slow > 0 ? (spread / slow) * 100 : 0;

    this.lastIndicators = { smaFast: fast, smaSlow: slow, atr, spread, spreadPct };

    if (!this.smaFast.isReady() || !this.smaSlow.isReady()) return null;

    if (state.position.side === "LONG") {
      this.barsInPosition++;
      if (spreadPct > 0.1 || this.barsInPosition > 24) {
        this.barsInPosition = 0;
        return { direction: "EXIT", reason: "spread_converged", indicators: this.lastIndicators };
      }
      return null;
    }

    if (spreadPct < -0.15 && atr < candle.close * 0.005) {
      return { direction: "LONG", reason: "stable_arb_entry", indicators: this.lastIndicators };
    }

    return null;
  }

  getIndicators(): Record<string, number> { return this.lastIndicators; }
  reset(): void {
    this.smaFast.reset(); this.smaSlow.reset(); this.atr.reset();
    this.barsInPosition = 0; this.lastIndicators = {};
  }
}

export function createXrpStableArb(config: StrategyConfig, meta: StrategyMeta): Strategy {
  return createBaseStrategy(config, meta, new XrpStableArbSignal());
}
