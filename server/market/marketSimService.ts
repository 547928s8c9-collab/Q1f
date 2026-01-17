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

interface Rng {
  next: () => number;
  normal: () => number;
}

interface SymbolState {
  lastPrice: number | null;
  lastTs: number;
  rng: Rng;
  mode: QuoteMode;
  initialized: boolean;
}

interface CandleHistory {
  currentStart: number;
  current: Candle | null;
  history: Candle[];
}

interface SessionState {
  symbols: string[];
  symbolState: Map<string, SymbolState>;
  quotes: Map<string, QuoteUpdate>;
  candles: Map<string, CandleHistory>;
}

interface QuoteEventPayload {
  sessionKey: string;
  quote: QuoteUpdate;
}

const ONE_MINUTE_MS = 60_000;
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT"];
const PERSIST_INTERVAL_MS = 5_000;
const DEFAULT_START_PRICE = 100;
const DEFAULT_HISTORY_CANDLES = 500;
const GLOBAL_SESSION_KEY = "global";

const FEED_MODE = (process.env.SIM_FEED_MODE || "synthetic").toLowerCase();
const USE_CANDLE_FEED = FEED_MODE !== "synthetic";
const SESSION_SEED_MODE = (process.env.SIM_SESSION_SEED_MODE || "session").toLowerCase();
const GLOBAL_SEED = Number(process.env.SIM_SEED || 1);
const TICK_MS = Math.max(250, Number(process.env.SIM_TICK_MS || 1000));
const VOL_PCT_PER_MIN = Number(process.env.SIM_VOL_PCT_PER_MIN || 0.6) / 100;
const DRIFT_PCT_PER_DAY = Number(process.env.SIM_DRIFT_PCT_PER_DAY || 0) / 100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): Rng {
  let t = seed >>> 0;
  let spare: number | null = null;

  const next = () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    const result = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return result;
  };

  const normal = () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    const z0 = mag * Math.cos(2 * Math.PI * v);
    const z1 = mag * Math.sin(2 * Math.PI * v);
    spare = z1;
    return z0;
  };

  return { next, normal };
}

class MarketSimService extends EventEmitter {
  private started = false;
  private sessions = new Map<string, SessionState>();
  private candleCache = new Map<string, { candleStart: number; candle: Candle }>();
  private interval: NodeJS.Timeout | null = null;
  private lastPersistAt = 0;
  private defaultSymbols: string[] = [];

  async ensureStarted(): Promise<void> {
    if (this.started || !isSimEnabled()) return;
    await ensureReplayClock();
    await this.loadSymbols();
    await this.ensureSessionSymbols(GLOBAL_SESSION_KEY, this.defaultSymbols, DEFAULT_HISTORY_CANDLES);
    await this.tick();
    this.interval = setInterval(() => {
      this.tick().catch((error) => {
        console.error("[marketSimService] tick error:", error);
      });
    }, TICK_MS);
    this.started = true;
  }

  getSymbols(): string[] {
    return this.defaultSymbols.slice();
  }

  async ensureSessionSymbols(sessionKey: string, symbols: string[], historyLimit?: number): Promise<void> {
    const normalizedSymbols = symbols.map((s) => normalizeSymbol(s)).filter(Boolean);
    const state = this.getSessionState(sessionKey);
    let added = false;

    for (const symbol of normalizedSymbols) {
      if (!state.symbols.includes(symbol)) {
        state.symbols.push(symbol);
        added = true;
      }
      if (!state.symbolState.has(symbol)) {
        state.symbolState.set(symbol, {
          lastPrice: null,
          lastTs: 0,
          rng: makeRng(this.getSymbolSeed(sessionKey, symbol)),
          mode: "synthetic",
          initialized: false,
        });
        added = true;
      }
      if (!state.candles.has(symbol)) {
        state.candles.set(symbol, { currentStart: 0, current: null, history: [] });
        added = true;
      }
      const limit = Math.max(historyLimit ?? 0, DEFAULT_HISTORY_CANDLES);
      await this.ensureSyntheticHistory(sessionKey, symbol, limit);
    }

    if (added && this.started) {
      await this.tick();
    }
  }

  getLatestQuotes(sessionKey: string, symbols?: string[]): QuoteUpdate[] {
    const state = this.getSessionState(sessionKey);
    if (!symbols || symbols.length === 0) {
      return Array.from(state.quotes.values());
    }
    const normalized = symbols.map((s) => normalizeSymbol(s));
    return normalized
      .map((sym) => state.quotes.get(sym))
      .filter((q): q is QuoteUpdate => Boolean(q));
  }

  getLatestQuote(sessionKey: string, symbol: string): QuoteUpdate | undefined {
    const state = this.getSessionState(sessionKey);
    return state.quotes.get(normalizeSymbol(symbol));
  }

  getLastKnownPrice(sessionKey: string, symbol: string): number | null {
    const state = this.getSessionState(sessionKey);
    const normalized = normalizeSymbol(symbol);
    return state.symbolState.get(normalized)?.lastPrice ?? null;
  }

  getSyntheticCandles(sessionKey: string, symbol: string, limit: number): Candle[] {
    const state = this.getSessionState(sessionKey);
    const normalized = normalizeSymbol(symbol);
    const history = state.candles.get(normalized);
    if (!history) return [];
    const combined = [
      ...history.history,
      ...(history.current ? [history.current] : []),
    ];
    return combined.slice(-limit);
  }

  private getSessionState(sessionKey: string): SessionState {
    const key = sessionKey || GLOBAL_SESSION_KEY;
    const existing = this.sessions.get(key);
    if (existing) return existing;

    const created: SessionState = {
      symbols: [],
      symbolState: new Map(),
      quotes: new Map(),
      candles: new Map(),
    };
    this.sessions.set(key, created);
    return created;
  }

  private async loadSymbols(): Promise<void> {
    const envSymbols = process.env.SIM_SYMBOLS;
    if (envSymbols) {
      const parsed = envSymbols.split(",").map((s) => normalizeSymbol(s.trim())).filter(Boolean);
      if (parsed.length > 0) {
        this.defaultSymbols = parsed;
        return;
      }
    }

    try {
      const profiles = await storage.getStrategyProfiles();
      const fromProfiles = profiles.map((p) => normalizeSymbol(p.symbol));
      this.defaultSymbols = Array.from(new Set(fromProfiles));
    } catch (error) {
      console.warn("[marketSimService] failed to load profiles, using defaults", error);
      this.defaultSymbols = DEFAULT_SYMBOLS;
    }

    if (this.defaultSymbols.length === 0) {
      this.defaultSymbols = DEFAULT_SYMBOLS;
    }
  }

  private async tick(): Promise<void> {
    if (!isSimEnabled()) return;
    const simNow = getSimNow();
    const quoteEvents: QuoteEventPayload[] = [];

    for (const [sessionKey, sessionState] of this.sessions) {
      if (sessionState.symbols.length === 0) continue;

      for (const symbol of sessionState.symbols) {
        const state = sessionState.symbolState.get(symbol);
        if (!state) continue;

        if (!state.initialized) {
          await this.ensureSyntheticHistory(sessionKey, symbol, DEFAULT_HISTORY_CANDLES);
        }

        let price: number | null = null;
        let mode: QuoteMode = "synthetic";

        if (USE_CANDLE_FEED) {
          try {
            const candle = await this.getCandleForSymbol(symbol, simNow);
            if (candle) {
              price = this.computeCandlePrice(candle, simNow);
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

        this.updateCandleHistory(sessionState, symbol, simNow, price);

        const update: QuoteUpdate = {
          symbol,
          ts: simNow,
          price,
        };

        sessionState.quotes.set(symbol, update);
        quoteEvents.push({ sessionKey, quote: update });
      }
    }

    for (const payload of quoteEvents) {
      this.emit("quote", payload);
    }

    const now = Date.now();
    if (now - this.lastPersistAt >= PERSIST_INTERVAL_MS) {
      const globalState = this.sessions.get(GLOBAL_SESSION_KEY);
      if (globalState) {
        const values = Array.from(globalState.quotes.values()).map((q) => ({
          symbol: q.symbol,
          ts: q.ts,
          price: q.price.toString(),
          source: "sim",
        }));
        if (values.length > 0) {
          this.lastPersistAt = now;
          await storage.upsertMarketLiveQuotes(values);
        }
      }
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

  private getSymbolSeed(sessionKey: string, symbol: string): number {
    const baseSeed = Number.isFinite(GLOBAL_SEED) ? GLOBAL_SEED : 1;
    if (SESSION_SEED_MODE === "session" && sessionKey !== GLOBAL_SESSION_KEY) {
      const sessionSeed = hash32(`${baseSeed}:${sessionKey}`);
      return hash32(`${sessionSeed}:${symbol}`);
    }
    return hash32(`${baseSeed}:${symbol}`);
  }

  private async ensureSyntheticHistory(sessionKey: string, symbol: string, historyCount: number): Promise<void> {
    const sessionState = this.getSessionState(sessionKey);
    const state = sessionState.symbolState.get(symbol);
    const history = sessionState.candles.get(symbol);
    if (!state || !history || state.initialized) return;

    const simNow = getSimNow();
    const currentStart = alignToGrid(simNow, ONE_MINUTE_MS);
    const startTs = currentStart - historyCount * ONE_MINUTE_MS;

    let price = await this.getFallbackPrice(symbol, state);
    const candles: Candle[] = [];

    for (let i = 0; i < historyCount; i++) {
      const ts = startTs + i * ONE_MINUTE_MS;
      const close = this.computeSyntheticStep(price, state.rng, 1);
      const high = Math.max(price, close) * (1 + state.rng.next() * VOL_PCT_PER_MIN * 0.5);
      const low = Math.min(price, close) * (1 - state.rng.next() * VOL_PCT_PER_MIN * 0.5);
      candles.push({
        ts,
        open: price,
        high: Math.max(0.0001, high),
        low: Math.max(0.0001, low),
        close,
        volume: 0,
      });
      price = close;
    }

    history.history = candles;
    history.currentStart = currentStart;
    history.current = {
      ts: currentStart,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };

    state.lastPrice = price;
    state.lastTs = currentStart;
    state.initialized = true;
  }

  private updateCandleHistory(sessionState: SessionState, symbol: string, simNow: number, price: number) {
    const history = sessionState.candles.get(symbol);
    if (!history) return;

    const candleStart = alignToGrid(simNow, ONE_MINUTE_MS);
    if (!history.current || history.currentStart === 0) {
      history.currentStart = candleStart;
      history.current = {
        ts: candleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      };
      return;
    }

    if (candleStart > history.currentStart) {
      history.history.push(history.current);
      if (history.history.length > DEFAULT_HISTORY_CANDLES) {
        history.history = history.history.slice(-DEFAULT_HISTORY_CANDLES);
      }
      history.currentStart = candleStart;
      history.current = {
        ts: candleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      };
      return;
    }

    history.current = {
      ...history.current,
      high: Math.max(history.current.high, price),
      low: Math.min(history.current.low, price),
      close: price,
    };
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

  private computeSyntheticStep(price: number, rng: Rng, dtMinutes: number): number {
    const vol = VOL_PCT_PER_MIN * Math.sqrt(dtMinutes);
    const drift = DRIFT_PCT_PER_DAY * (dtMinutes / 1440);
    const z = clamp(rng.normal(), -4, 4);
    const nextPrice = price * Math.exp(drift + vol * z);
    return Math.max(0.0001, nextPrice);
  }

  private computeSyntheticPrice(state: SymbolState, simNow: number, seedPrice: number): number {
    const basePrice = seedPrice > 0 ? seedPrice : DEFAULT_START_PRICE;
    const lastTs = state.lastTs || simNow - TICK_MS;
    const elapsedMinutes = Math.max(1 / 60, (simNow - lastTs) / ONE_MINUTE_MS);
    return this.computeSyntheticStep(basePrice, state.rng, elapsedMinutes);
  }

  private computeCandlePrice(candle: Candle, simNow: number): number {
    const progress = clamp((simNow - candle.ts) / ONE_MINUTE_MS, 0, 1);
    const base = candle.open + (candle.close - candle.open) * progress;
    const range = Math.max(0.000001, candle.high - candle.low);
    const noise = (Math.random() - 0.5) * range * 0.2;
    return clamp(base + noise, candle.low, candle.high);
  }
}

export const marketSimService = new MarketSimService();
