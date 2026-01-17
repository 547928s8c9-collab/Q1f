import { EventEmitter } from "events";
import type { Candle } from "@shared/schema";
import { storage } from "../storage";
import { loadCandles, alignToGrid } from "../marketData/loadCandles";
import { normalizeSymbol } from "../marketData/utils";
import { ensureReplayClock, getSimNow, isSimEnabled } from "./replayClock";

export interface QuoteUpdate {
  symbol: string;
  ts: number;
  price: number;
}

type QuoteMode = "candle" | "synthetic";

interface SymbolState {
  lastPrice: number | null;
  lastTs: number;
  driftSeed: number;
  mode: QuoteMode;
}

interface CandleCacheEntry {
  candleStart: number;
  candle: Candle;
}

const ONE_MINUTE_MS = 60_000;
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT"];
const PERSIST_INTERVAL_MS = 5_000;
const DEFAULT_START_PRICE = 100;
const MAX_PCT_MOVE_PER_SEC = 0.0015;
const FEED_MODE = (process.env.SIM_FEED_MODE || "synthetic").toLowerCase();
const USE_CANDLE_FEED = FEED_MODE !== "synthetic";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class MarketSimService extends EventEmitter {
  private started = false;
  private symbols: string[] = [];
  private quotes = new Map<string, QuoteUpdate>();
  private candleCache = new Map<string, CandleCacheEntry>();
  private symbolState = new Map<string, SymbolState>();
  private interval: NodeJS.Timeout | null = null;
  private lastPersistAt = 0;

  async ensureStarted(): Promise<void> {
    if (this.started || !isSimEnabled()) return;
    await ensureReplayClock();
    await this.loadSymbols();
    await this.tick();
    this.interval = setInterval(() => {
      this.tick().catch((error) => {
        console.error("[marketSimService] tick error:", error);
      });
    }, 1000);
    this.started = true;
  }

  getSymbols(): string[] {
    return this.symbols.slice();
  }

  ensureSymbols(symbols: string[]): void {
    let added = false;
    for (const raw of symbols) {
      const symbol = normalizeSymbol(raw);
      if (!symbol) continue;
      if (!this.symbols.includes(symbol)) {
        this.symbols.push(symbol);
        added = true;
      }
      if (!this.symbolState.has(symbol)) {
        this.symbolState.set(symbol, {
          lastPrice: null,
          lastTs: 0,
          driftSeed: Math.random() * 2 - 1,
          mode: "synthetic",
        });
        added = true;
      }
    }

    if (added && this.started) {
      this.tick().catch((error) => {
        console.error("[marketSimService] tick error after adding symbols:", error);
      });
    }
  }

  getLatestQuotes(symbols?: string[]): QuoteUpdate[] {
    if (!symbols || symbols.length === 0) {
      return Array.from(this.quotes.values());
    }
    const normalized = symbols.map((s) => normalizeSymbol(s));
    return normalized
      .map((sym) => this.quotes.get(sym))
      .filter((q): q is QuoteUpdate => Boolean(q));
  }

  getLatestQuote(symbol: string): QuoteUpdate | undefined {
    return this.quotes.get(normalizeSymbol(symbol));
  }

  getLastKnownPrice(symbol: string): number | null {
    const normalized = normalizeSymbol(symbol);
    return this.symbolState.get(normalized)?.lastPrice ?? null;
  }

  private async loadSymbols(): Promise<void> {
    const envSymbols = process.env.SIM_SYMBOLS;
    if (envSymbols) {
      this.symbols = envSymbols.split(",").map((s) => normalizeSymbol(s.trim())).filter(Boolean);
      if (this.symbols.length > 0) return;
    }

    try {
      const profiles = await storage.getStrategyProfiles();
      const fromProfiles = profiles.map((p) => normalizeSymbol(p.symbol));
      this.symbols = Array.from(new Set(fromProfiles));
    } catch (error) {
      console.warn("[marketSimService] failed to load profiles, using defaults", error);
      this.symbols = DEFAULT_SYMBOLS;
    }

    if (this.symbols.length === 0) {
      this.symbols = DEFAULT_SYMBOLS;
    }

    for (const symbol of this.symbols) {
      if (!this.symbolState.has(symbol)) {
        this.symbolState.set(symbol, {
          lastPrice: null,
          lastTs: 0,
          driftSeed: Math.random() * 2 - 1,
          mode: "synthetic",
        });
      }
    }
  }

  private async tick(): Promise<void> {
    if (!isSimEnabled() || this.symbols.length === 0) return;

    const simNow = getSimNow();
    const quotesToPersist: QuoteUpdate[] = [];

    for (const symbol of this.symbols) {
      const state = this.getOrCreateState(symbol);
      let price: number | null = null;
      let mode: QuoteMode = "synthetic";

      if (USE_CANDLE_FEED) {
        try {
          const candle = await this.getCandleForSymbol(symbol, simNow);
          if (candle) {
            price = this.computePrice(candle, simNow);
            mode = "candle";
          }
        } catch (error) {
          console.error(`[marketSimService] candle lookup failed for ${symbol}:`, error);
        }
      }

      if (price === null) {
        const fallback = await this.getFallbackPrice(symbol, state);
        price = this.computeSyntheticPrice(state, simNow, fallback);
        mode = "synthetic";
      }

      state.lastPrice = price;
      state.lastTs = simNow;
      state.mode = mode;

      const update: QuoteUpdate = {
        symbol,
        ts: simNow,
        price,
      };

      this.quotes.set(symbol, update);
      quotesToPersist.push(update);
      this.emit("quote", update);
    }

    const now = Date.now();
    if (quotesToPersist.length > 0 && now - this.lastPersistAt >= PERSIST_INTERVAL_MS) {
      this.lastPersistAt = now;
      await storage.upsertMarketLiveQuotes(
        quotesToPersist.map((q) => ({
          symbol: q.symbol,
          ts: q.ts,
          price: q.price.toString(),
          source: "sim",
        }))
      );
    }
  }

  private async getCandleForSymbol(symbol: string, simNow: number): Promise<Candle | null> {
    const candleStart = alignToGrid(simNow, ONE_MINUTE_MS);
    const cached = this.candleCache.get(symbol);
    if (cached && cached.candleStart === candleStart) {
      return cached.candle;
    }

    const result = await loadCandles({
      exchange: "cryptocompare",
      symbol,
      timeframe: "1m",
      startMs: candleStart,
      endMs: candleStart + ONE_MINUTE_MS,
      maxBars: 5,
    });

    const candle = result.candles[0];
    if (!candle) return null;

    this.candleCache.set(symbol, { candleStart, candle });
    return candle;
  }

  private getOrCreateState(symbol: string): SymbolState {
    const normalized = normalizeSymbol(symbol);
    const existing = this.symbolState.get(normalized);
    if (existing) return existing;

    const created: SymbolState = {
      lastPrice: null,
      lastTs: 0,
      driftSeed: Math.random() * 2 - 1,
      mode: "synthetic",
    };
    this.symbolState.set(normalized, created);
    return created;
  }

  private async getFallbackPrice(symbol: string, state: SymbolState): Promise<number> {
    if (state.lastPrice && Number.isFinite(state.lastPrice)) {
      return state.lastPrice;
    }

    const latest = await storage.getLatestMarketCandle(normalizeSymbol(symbol));
    if (latest?.close && Number.isFinite(latest.close)) {
      return latest.close;
    }

    return DEFAULT_START_PRICE;
  }

  private computeSyntheticPrice(state: SymbolState, simNow: number, seedPrice: number): number {
    const basePrice = seedPrice > 0 ? seedPrice : DEFAULT_START_PRICE;
    const elapsedSec = Math.max(1, (simNow - (state.lastTs || simNow)) / 1000);
    const maxMove = MAX_PCT_MOVE_PER_SEC * elapsedSec;
    const jitter = (Math.random() * 2 - 1) * maxMove;
    const drift = state.driftSeed * maxMove * 0.2;
    const pctMove = clamp(jitter + drift, -maxMove, maxMove);
    return Math.max(0.0001, basePrice * (1 + pctMove));
  }

  private computePrice(candle: Candle, simNow: number): number {
    const progress = clamp((simNow - candle.ts) / ONE_MINUTE_MS, 0, 1);
    const base = candle.open + (candle.close - candle.open) * progress;
    const range = Math.max(0.000001, candle.high - candle.low);
    const noise = (Math.random() - 0.5) * range * 0.2;
    return clamp(base + noise, candle.low, candle.high);
  }
}

export const marketSimService = new MarketSimService();
