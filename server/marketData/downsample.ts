import type { Candle, Timeframe } from "@shared/schema";
import { timeframeToMs } from "./utils";

const TIMEFRAME_ORDER: Timeframe[] = ["15m", "1h", "1d"];

function nextTimeframe(timeframe: Timeframe): Timeframe | null {
  const index = TIMEFRAME_ORDER.indexOf(timeframe);
  if (index < 0 || index === TIMEFRAME_ORDER.length - 1) return null;
  return TIMEFRAME_ORDER[index + 1];
}

export function resolveDownsampleTimeframe(params: {
  timeframe: Timeframe;
  startMs: number;
  endMs: number;
  maxBars: number;
}): Timeframe {
  const { timeframe, startMs, endMs, maxBars } = params;
  let effective = timeframe;
  let stepMs = timeframeToMs(effective);
  let bars = Math.ceil((endMs - startMs) / stepMs);

  while (bars > maxBars) {
    const next = nextTimeframe(effective);
    if (!next) break;
    effective = next;
    stepMs = timeframeToMs(effective);
    bars = Math.ceil((endMs - startMs) / stepMs);
  }

  return effective;
}

export function aggregateCandles(
  candles: Candle[],
  fromTimeframe: Timeframe,
  toTimeframe: Timeframe
): Candle[] {
  const fromMs = timeframeToMs(fromTimeframe);
  const toMs = timeframeToMs(toTimeframe);

  if (toMs <= fromMs) {
    return candles.slice().sort((a, b) => a.ts - b.ts);
  }

  const sorted = candles.slice().sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return [];

  const aggregated: Candle[] = [];
  let bucketTs = Math.floor(sorted[0].ts / toMs) * toMs;
  let open = sorted[0].open;
  let high = sorted[0].high;
  let low = sorted[0].low;
  let close = sorted[0].close;
  let volume = sorted[0].volume;

  for (let i = 1; i < sorted.length; i += 1) {
    const candle = sorted[i];
    const candleBucket = Math.floor(candle.ts / toMs) * toMs;

    if (candleBucket !== bucketTs) {
      aggregated.push({ ts: bucketTs, open, high, low, close, volume });
      bucketTs = candleBucket;
      open = candle.open;
      high = candle.high;
      low = candle.low;
      close = candle.close;
      volume = candle.volume;
      continue;
    }

    high = Math.max(high, candle.high);
    low = Math.min(low, candle.low);
    close = candle.close;
    volume += candle.volume;
  }

  aggregated.push({ ts: bucketTs, open, high, low, close, volume });
  return aggregated;
}
