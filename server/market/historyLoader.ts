import { storage } from "../storage";
import { loadCandles, alignToGrid, findMissingRanges } from "../marketData/loadCandles";
import { normalizeSymbol, normalizeTimeframe, timeframeToMs } from "../marketData/utils";
import { ensureReplayClock, getDecisionNow, isSimEnabled } from "./replayClock";

const HISTORY_LOOP_MS = Number(process.env.SIM_HISTORY_LOADER_MS || 30000);
const PROFILE_REFRESH_MS = 60000;
const MAX_BARS_PER_REQUEST = 2000;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "TRXUSDT"];

class HistoryCandleLoader {
  private started = false;
  private running = false;
  private loopTimer: NodeJS.Timeout | null = null;
  private lastProfileAt = 0;
  private symbols: string[] = [];
  private timeframes: string[] = [];
  private warmupByTimeframe = new Map<string, number>();

  async ensureStarted(): Promise<void> {
    if (this.started || !isSimEnabled()) return;
    await ensureReplayClock();
    await this.refreshProfiles(true);
    await this.runLoop();
    this.loopTimer = setInterval(() => {
      this.runLoop().catch((error) => {
        console.error("[historyLoader] runLoop error:", error);
      });
    }, HISTORY_LOOP_MS);
    this.started = true;
  }

  private async refreshProfiles(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastProfileAt < PROFILE_REFRESH_MS) {
      return;
    }

    try {
      const profiles = await storage.getStrategyProfiles();
      const symbols = new Set<string>();
      const warmupByTf = new Map<string, number>();

      for (const profile of profiles) {
        const symbol = normalizeSymbol(profile.symbol);
        symbols.add(symbol);

        const timeframe = normalizeTimeframe(profile.timeframe);
        const tfMs = timeframeToMs(timeframe);
        const warmupBars = profile.defaultConfig?.minBarsWarmup ?? 200;
        const warmupMs = warmupBars * tfMs;

        const existing = warmupByTf.get(timeframe) ?? 0;
        warmupByTf.set(timeframe, Math.max(existing, warmupMs));
      }

      if (symbols.size === 0) {
        const envSymbols = process.env.SIM_SYMBOLS;
        const fallback = envSymbols
          ? envSymbols.split(",").map((s) => normalizeSymbol(s.trim())).filter(Boolean)
          : DEFAULT_SYMBOLS;
        for (const symbol of fallback) {
          symbols.add(symbol);
        }
      }

      warmupByTf.set("1m", Math.max(warmupByTf.get("1m") ?? 0, DEFAULT_LOOKBACK_MS));

      this.symbols = Array.from(symbols);
      this.timeframes = Array.from(new Set([...warmupByTf.keys(), "1m"]));
      this.warmupByTimeframe = warmupByTf;
      this.lastProfileAt = now;
    } catch (error) {
      console.error("[historyLoader] failed to refresh profiles:", error);
      if (this.symbols.length === 0) {
        this.symbols = DEFAULT_SYMBOLS;
        this.timeframes = ["1m", "15m", "1h"];
      }
    }
  }

  private async runLoop(): Promise<void> {
    if (this.running || !isSimEnabled()) return;
    this.running = true;

    try {
      await ensureReplayClock();
      await this.refreshProfiles();

      const decisionNow = getDecisionNow();

      for (const symbol of this.symbols) {
        for (const timeframe of this.timeframes) {
          const normalizedTf = normalizeTimeframe(timeframe);
          const tfMs = timeframeToMs(normalizedTf);
          const lookbackMs = Math.max(this.warmupByTimeframe.get(normalizedTf) ?? 0, DEFAULT_LOOKBACK_MS);

          const toTs = alignToGrid(decisionNow, tfMs);
          const fromTs = alignToGrid(Math.max(0, toTs - lookbackMs), tfMs);

          if (toTs <= fromTs) continue;

          await this.ensureWindow(symbol, normalizedTf, fromTs, toTs);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async ensureWindow(symbol: string, timeframe: string, fromTs: number, toTs: number): Promise<void> {
    const tfMs = timeframeToMs(normalizeTimeframe(timeframe));
    const cached = await storage.getCandlesFromCache("cryptocompare", symbol, timeframe, fromTs, toTs);
    const missingRanges = findMissingRanges(cached, fromTs, toTs, tfMs);

    for (const range of missingRanges) {
      await this.fetchRange(symbol, timeframe, range.startMs, range.endMs, tfMs);
    }
  }

  private async fetchRange(symbol: string, timeframe: string, startMs: number, endMs: number, tfMs: number): Promise<void> {
    let cursor = startMs;
    while (cursor < endMs) {
      const nextEnd = Math.min(endMs, cursor + MAX_BARS_PER_REQUEST * tfMs);
      try {
        await loadCandles({
          exchange: "cryptocompare",
          symbol,
          timeframe,
          startMs: cursor,
          endMs: nextEnd,
          maxBars: MAX_BARS_PER_REQUEST,
          allowLargeRange: true,
        });
      } catch (error) {
        console.error(`[historyLoader] fetch failed for ${symbol} ${timeframe}`, error);
        return;
      }
      cursor = nextEnd;
    }
  }
}

export const historyCandleLoader = new HistoryCandleLoader();
