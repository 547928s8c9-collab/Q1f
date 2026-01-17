import type { Candle, Timeframe } from "@shared/schema";

const BASE_URL = "https://min-api.cryptocompare.com/data";
const MAX_LIMIT = 2000;
const REQUEST_TIMEOUT_MS = 15000;
const THROTTLE_MS = 250;

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RETRIES = 5;

export interface CryptoCompareConfig {
  apiKey?: string;
  fetchFn?: typeof fetch;
}

interface CryptoCompareCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumefrom: number;
  volumeto: number;
}

interface CryptoCompareResponse {
  Response: string;
  Message?: string;
  HasWarning?: boolean;
  Data: {
    Aggregated: boolean;
    TimeFrom: number;
    TimeTo: number;
    Data: CryptoCompareCandle[];
  };
}

export class CryptoCompareDataSource {
  private apiKey: string;
  private fetchFn: typeof fetch;

  constructor(config: CryptoCompareConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.CRYPTOCOMPARE_API_KEY ?? "";
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async fetchCandles(
    symbol: string,
    timeframe: Timeframe,
    startMs: number,
    endMs: number
  ): Promise<Candle[]> {
    const { fsym, tsym } = this.parseSymbol(symbol);
    const endpoint = this.getEndpoint(timeframe);
    const aggregate = this.getAggregate(timeframe);
    const tfMs = this.timeframeToMs(timeframe);
    
    const allCandles: Candle[] = [];
    let currentEndTs = Math.floor(endMs / 1000);
    const startTs = Math.floor(startMs / 1000);
    let isFirstRequest = true;

    while (currentEndTs > startTs) {
      if (!isFirstRequest) {
        await this.sleep(THROTTLE_MS);
      }
      isFirstRequest = false;

      const batch = await this.fetchBatch(fsym, tsym, endpoint, aggregate, currentEndTs);
      if (batch.length === 0) break;

      const candlesInRange = batch.filter(c => c.ts >= startMs && c.ts < endMs);
      allCandles.push(...candlesInRange);

      const oldestTs = batch[0].ts;
      currentEndTs = Math.floor(oldestTs / 1000) - 1;

      if (oldestTs <= startMs) break;
      if (batch.length < MAX_LIMIT) break;
    }

    return this.dedupeAndSort(allCandles);
  }

  private async fetchBatch(
    fsym: string,
    tsym: string,
    endpoint: string,
    aggregate: number,
    toTs: number
  ): Promise<Candle[]> {
    const url = new URL(`${BASE_URL}/${endpoint}`);
    url.searchParams.set("fsym", fsym);
    url.searchParams.set("tsym", tsym);
    url.searchParams.set("limit", MAX_LIMIT.toString());
    url.searchParams.set("toTs", toTs.toString());
    if (aggregate > 1) {
      url.searchParams.set("aggregate", aggregate.toString());
    }
    if (this.apiKey) {
      url.searchParams.set("api_key", this.apiKey);
    }

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

        if (!response.ok) {
          throw new Error(`CryptoCompare API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as CryptoCompareResponse;
        
        if (data.Response === "Error") {
          throw new Error(`CryptoCompare API error: ${data.Message || "Unknown error"}`);
        }

        return this.parseCandles(data.Data?.Data || []);
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

  private parseSymbol(symbol: string): { fsym: string; tsym: string } {
    const normalized = symbol.toUpperCase().replace(/[-_\/]/g, "");
    
    const stablecoins = ["USDT", "USDC", "BUSD", "DAI", "TUSD", "UST"];
    const fiats = ["USD", "EUR", "GBP", "JPY", "RUB", "AUD", "CAD"];
    
    for (const quote of [...stablecoins, ...fiats]) {
      if (normalized.endsWith(quote)) {
        return {
          fsym: normalized.slice(0, -quote.length),
          tsym: quote,
        };
      }
    }
    
    return { fsym: normalized, tsym: "USD" };
  }

  private parseCandles(data: CryptoCompareCandle[]): Candle[] {
    return data
      .filter(c => c.open > 0 || c.close > 0)
      .map(c => ({
        ts: c.time * 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volumefrom,
      }));
  }

  private dedupeAndSort(candles: Candle[]): Candle[] {
    const seen = new Map<number, Candle>();
    for (const c of candles) {
      seen.set(c.ts, c);
    }
    return Array.from(seen.values()).sort((a, b) => a.ts - b.ts);
  }

  private getEndpoint(tf: Timeframe): string {
    switch (tf) {
      case "1m": return "v2/histominute";
      case "15m": return "v2/histominute";
      case "1h": return "v2/histohour";
      case "1d": return "v2/histoday";
    }
  }

  private getAggregate(tf: Timeframe): number {
    switch (tf) {
      case "1m": return 1;
      case "15m": return 15;
      case "1h": return 1;
      case "1d": return 1;
    }
  }

  private timeframeToMs(tf: Timeframe): number {
    switch (tf) {
      case "1m": return 60000;
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

export const cryptoCompare = new CryptoCompareDataSource();
