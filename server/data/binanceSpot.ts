import type { Candle, Timeframe } from "@shared/schema";

const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const MAX_KLINES_LIMIT = 1000;
const REQUEST_TIMEOUT_MS = 15000;
const THROTTLE_MS = 250; // Throttle between requests to avoid rate limits

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RETRIES = 5;

export interface BinanceSpotConfig {
  fetchFn?: typeof fetch;
}

export class BinanceSpotDataSource {
  private fetchFn: typeof fetch;

  constructor(config: BinanceSpotConfig = {}) {
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async fetchCandles(
    symbol: string,
    timeframe: Timeframe,
    startMs: number,
    endMs: number
  ): Promise<Candle[]> {
    const interval = this.timeframeToInterval(timeframe);
    const allCandles: Candle[] = [];
    let currentStart = startMs;
    let isFirstRequest = true;

    while (currentStart < endMs) {
      // Throttle between requests (skip first request)
      if (!isFirstRequest) {
        await this.sleep(THROTTLE_MS);
      }
      isFirstRequest = false;

      const batch = await this.fetchBatch(symbol, interval, currentStart, endMs);
      if (batch.length === 0) break;

      allCandles.push(...batch);
      const lastTs = batch[batch.length - 1].ts;
      currentStart = lastTs + this.timeframeToMs(timeframe);

      if (batch.length < MAX_KLINES_LIMIT) break;
    }

    return this.dedupeAndSort(allCandles);
  }

  private async fetchBatch(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
  ): Promise<Candle[]> {
    const url = new URL(BINANCE_KLINES_URL);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", startTime.toString());
    url.searchParams.set("endTime", (endTime - 1).toString());
    url.searchParams.set("limit", MAX_KLINES_LIMIT.toString());

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url.toString(), REQUEST_TIMEOUT_MS);

        if (response.status === 429) {
          const backoffMs = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
          await this.sleep(backoffMs);
          continue;
        }

        if (response.status >= 500 && response.status < 600) {
          const backoffMs = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
          await this.sleep(backoffMs);
          continue;
        }

        if (response.status === 451) {
          throw new Error(`Binance API blocked (451): Access restricted from this region`);
        }

        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as unknown[][];
        return this.parseKlines(data);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (this.isRetryableError(lastError) && attempt < MAX_RETRIES) {
          const backoffMs = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
          await this.sleep(backoffMs);
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error("Max retries exceeded");
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchFn(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseKlines(data: unknown[][]): Candle[] {
    return data.map((kline) => ({
      ts: Number(kline[0]),
      open: parseFloat(String(kline[1])),
      high: parseFloat(String(kline[2])),
      low: parseFloat(String(kline[3])),
      close: parseFloat(String(kline[4])),
      volume: parseFloat(String(kline[5])),
    }));
  }

  private dedupeAndSort(candles: Candle[]): Candle[] {
    const seen = new Map<number, Candle>();
    for (const c of candles) {
      seen.set(c.ts, c);
    }
    return Array.from(seen.values()).sort((a, b) => a.ts - b.ts);
  }

  private timeframeToInterval(tf: Timeframe): string {
    switch (tf) {
      case "1m": return "1m";
      case "5m": return "5m";
      case "15m": return "15m";
      case "1h": return "1h";
      case "1d": return "1d";
    }
  }

  private timeframeToMs(tf: Timeframe): number {
    switch (tf) {
      case "1m": return 60_000;
      case "5m": return 300_000;
      case "15m": return 900000;
      case "1h": return 3600000;
      case "1d": return 86400000;
    }
  }

  private isRetryableError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("network") ||
      msg.includes("abort")
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const binanceSpot = new BinanceSpotDataSource();
