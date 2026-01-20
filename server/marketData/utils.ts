import type { Timeframe } from "@shared/schema";
import { VALID_TIMEFRAMES } from "@shared/schema";

export function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[\/\-_]/g, "").toUpperCase();
}

export function normalizeTimeframe(tf: string): Timeframe {
  const normalized = tf.toLowerCase().trim();
  
  const mapping: Record<string, Timeframe> = {
    "1m": "1m",
    "1min": "1m",
    "5m": "5m",
    "5min": "5m",
    "15m": "15m",
    "15min": "15m",
    "1h": "1h",
    "1hr": "1h",
    "60m": "1h",
    "1d": "1d",
    "1day": "1d",
    "d": "1d",
  };

  const result = mapping[normalized];
  if (!result) {
    throw new Error(`Invalid timeframe: ${tf}. Valid values: ${VALID_TIMEFRAMES.join(", ")}`);
  }
  return result;
}

export function timeframeToMs(tf: Timeframe): number {
  switch (tf) {
    case "1m": return 60_000;
    case "5m": return 300_000;
    case "15m": return 900_000;
    case "1h": return 3_600_000;
    case "1d": return 86_400_000;
  }
}

export function isValidTimeframe(tf: string): tf is Timeframe {
  return VALID_TIMEFRAMES.includes(tf as Timeframe);
}
