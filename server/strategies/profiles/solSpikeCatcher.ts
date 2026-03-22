import type { Candle } from "@shared/schema";
import type { StrategyState, SignalPayload, StrategyConfig, StrategyMeta, Strategy } from "../types";
import type { SignalGenerator } from "../executor";
import { createBaseStrategy } from "../executor";
import { EMA, ATR, VolumeMA, RSI } from "../indicators";

class SolSpikeCatcherSignal implements SignalGenerator {
  private ema: EMA;
  private atr: ATR;
  private volumeMA: VolumeMA;
  private rsi: RSI;
  private prevCandle: { close: number; high: number; low: number } | null = null;
  private barsInPosition = 0;
  private lastIndicators: Record<string, number> = {};

  constructor(emaPeriod = 14, atrPeriod = 14, volPeriod = 20, rsiPeriod = 14) {
    this.ema = new EMA(emaPeriod);
    this.atr = new ATR(atrPeriod);
    this.volumeMA = new VolumeMA(volPeriod);
    this.rsi = new RSI(rsiPeriod);
  }

  onCandle(candle: Candle, state: StrategyState): SignalPayload | null {
    const ema = this.ema.update(candle.close);
    const atr = this.atr.updateHLC(candle.high, candle.low, candle.close);
    this.volumeMA.update(candle.volume);
    const relVol = this.volumeMA.getRelativeVolume(candle.volume);
    const rsi = this.rsi.update(candle.close);
    const candleRange = candle.high - candle.low;
    const spikeRatio = atr > 0 ? candleRange / atr : 0;

    this.lastIndicators = { ema, atr, relVol, rsi, spikeRatio, candleRange };

    if (!this.ema.isReady() || !this.rsi.isReady()) {
      this.prevCandle = { close: candle.close, high: candle.high, low: candle.low };
      return null;
    }

    if (state.position.side === "LONG") {
      this.barsInPosition++;
      if (rsi > 75 || this.barsInPosition > 10) {
        this.barsInPosition = 0;
        this.prevCandle = { close: candle.close, high: candle.high, low: candle.low };
        return { direction: "EXIT", reason: "spike_target_exit", indicators: this.lastIndicators };
      }
      if (candle.close < ema - atr * 2.5) {
        this.barsInPosition = 0;
        this.prevCandle = { close: candle.close, high: candle.high, low: candle.low };
        return { direction: "EXIT", reason: "spike_stop_loss", indicators: this.lastIndicators };
      }
      this.prevCandle = { close: candle.close, high: candle.high, low: candle.low };
      return null;
    }

    if (spikeRatio > 2.0 && relVol > 1.8 && candle.close > candle.open && candle.close > ema) {
      this.prevCandle = { close: candle.close, high: candle.high, low: candle.low };
      return { direction: "LONG", reason: "spike_breakout_entry", indicators: this.lastIndicators };
    }

    this.prevCandle = { close: candle.close, high: candle.high, low: candle.low };
    return null;
  }

  getIndicators(): Record<string, number> { return this.lastIndicators; }
  reset(): void {
    this.ema.reset(); this.atr.reset(); this.volumeMA.reset(); this.rsi.reset();
    this.prevCandle = null; this.barsInPosition = 0; this.lastIndicators = {};
  }
}

export function createSolSpikeCatcher(config: StrategyConfig, meta: StrategyMeta): Strategy {
  return createBaseStrategy(config, meta, new SolSpikeCatcherSignal());
}
