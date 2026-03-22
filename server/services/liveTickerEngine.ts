import { logger } from "../lib/logger";

export interface TickerQuote {
  symbol: string;
  pair: string;
  price: number;
  prevPrice: number;
  change24h: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  updatedAt: number;
}

export interface TradeEvent {
  id: string;
  symbol: string;
  pair: string;
  side: "BUY" | "SELL";
  price: number;
  amount: number;
  total: number;
  ts: number;
  strategy?: string;
}

export interface TickerSnapshot {
  quotes: TickerQuote[];
  sparklines: Record<string, number[]>;
}

interface PairConfig {
  symbol: string;
  pair: string;
  basePrice: number;
  volatility: number;
  drift: number;
  volumeBase: number;
  tradeFrequency: number;
  strategy?: string;
}

const PAIR_CONFIGS: PairConfig[] = [
  { symbol: "BTCUSDT", pair: "BTC/USDT", basePrice: 67500, volatility: 0.0012, drift: 0.00002, volumeBase: 450, tradeFrequency: 0.4, strategy: "BTC Squeeze Breakout" },
  { symbol: "ETHUSDT", pair: "ETH/USDT", basePrice: 3450, volatility: 0.0015, drift: 0.00001, volumeBase: 2800, tradeFrequency: 0.35, strategy: "ETH EMA Revert" },
  { symbol: "BNBUSDT", pair: "BNB/USDT", basePrice: 580, volatility: 0.0010, drift: 0.000008, volumeBase: 8500, tradeFrequency: 0.3, strategy: "BNB Trend Pullback" },
  { symbol: "SOLUSDT", pair: "SOL/USDT", basePrice: 145, volatility: 0.0020, drift: 0.000015, volumeBase: 15000, tradeFrequency: 0.38, strategy: "SOL Volatility Burst" },
  { symbol: "XRPUSDT", pair: "XRP/USDT", basePrice: 0.62, volatility: 0.0013, drift: 0.000005, volumeBase: 520000, tradeFrequency: 0.25, strategy: "XRP Keltner Revert" },
  { symbol: "DOGEUSDT", pair: "DOGE/USDT", basePrice: 0.155, volatility: 0.0022, drift: 0.00001, volumeBase: 1800000, tradeFrequency: 0.42, strategy: "DOGE Fast Momentum" },
  { symbol: "ADAUSDT", pair: "ADA/USDT", basePrice: 0.45, volatility: 0.0014, drift: 0.000006, volumeBase: 680000, tradeFrequency: 0.28, strategy: "ADA Deep Revert" },
  { symbol: "TRXUSDT", pair: "TRX/USDT", basePrice: 0.115, volatility: 0.0008, drift: 0.000003, volumeBase: 2200000, tradeFrequency: 0.2, strategy: "TRX Low-Vol Band" },
];

const SPARKLINE_POINTS = 96;
const TICK_INTERVAL_MS = 2500;
const MAX_TRADE_HISTORY = 50;

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

let tradeIdCounter = 0;

class LiveTickerEngine {
  private prices: Map<string, number> = new Map();
  private prevPrices: Map<string, number> = new Map();
  private sparklines: Map<string, number[]> = new Map();
  private high24h: Map<string, number> = new Map();
  private low24h: Map<string, number> = new Map();
  private volume24h: Map<string, number> = new Map();
  private openPrices: Map<string, number> = new Map();
  private recentTrades: TradeEvent[] = [];
  private listeners: Set<(data: string) => void> = new Set();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor() {
    for (const config of PAIR_CONFIGS) {
      const jitter = 1 + (Math.random() - 0.5) * 0.02;
      const initPrice = config.basePrice * jitter;
      this.prices.set(config.symbol, initPrice);
      this.prevPrices.set(config.symbol, initPrice);
      this.openPrices.set(config.symbol, initPrice);
      this.high24h.set(config.symbol, initPrice * 1.008);
      this.low24h.set(config.symbol, initPrice * 0.992);
      this.volume24h.set(config.symbol, config.volumeBase * (0.8 + Math.random() * 0.4));

      const sparkline: number[] = [];
      let p = initPrice;
      for (let i = 0; i < SPARKLINE_POINTS; i++) {
        p *= 1 + gaussianRandom() * config.volatility * 2;
        sparkline.push(p);
      }
      sparkline[sparkline.length - 1] = initPrice;
      this.sparklines.set(config.symbol, sparkline);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    logger.info("LiveTickerEngine started", "live-ticker");
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    logger.info("LiveTickerEngine stopped", "live-ticker");
  }

  private tick(): void {
    const tickQuotes: TickerQuote[] = [];
    const newTrades: TradeEvent[] = [];
    const now = Date.now();

    for (const config of PAIR_CONFIGS) {
      const currentPrice = this.prices.get(config.symbol)!;
      this.prevPrices.set(config.symbol, currentPrice);

      const returnVal = config.drift + gaussianRandom() * config.volatility;
      const newPrice = currentPrice * (1 + returnVal);
      this.prices.set(config.symbol, newPrice);

      const sparkline = this.sparklines.get(config.symbol)!;
      sparkline.push(newPrice);
      if (sparkline.length > SPARKLINE_POINTS) {
        sparkline.shift();
      }

      const high = this.high24h.get(config.symbol)!;
      const low = this.low24h.get(config.symbol)!;
      if (newPrice > high) this.high24h.set(config.symbol, newPrice);
      if (newPrice < low) this.low24h.set(config.symbol, newPrice);

      const vol = this.volume24h.get(config.symbol)!;
      const volDelta = config.volumeBase * 0.001 * (0.5 + Math.random());
      this.volume24h.set(config.symbol, vol + volDelta);

      const openPrice = this.openPrices.get(config.symbol)!;
      const change24h = newPrice - openPrice;
      const change24hPct = (change24h / openPrice) * 100;

      tickQuotes.push({
        symbol: config.symbol,
        pair: config.pair,
        price: newPrice,
        prevPrice: currentPrice,
        change24h,
        change24hPct,
        high24h: this.high24h.get(config.symbol)!,
        low24h: this.low24h.get(config.symbol)!,
        volume24h: this.volume24h.get(config.symbol)!,
        updatedAt: now,
      });

      if (Math.random() < config.tradeFrequency) {
        const side: "BUY" | "SELL" = Math.random() > 0.48 ? "BUY" : "SELL";
        const amount = +(config.volumeBase * (0.001 + Math.random() * 0.005)).toFixed(
          newPrice > 100 ? 4 : newPrice > 1 ? 2 : 0
        );
        const trade: TradeEvent = {
          id: `t-${now}-${++tradeIdCounter}`,
          symbol: config.symbol,
          pair: config.pair,
          side,
          price: newPrice,
          amount,
          total: +(newPrice * amount).toFixed(2),
          ts: now,
          strategy: config.strategy,
        };
        newTrades.push(trade);
        this.recentTrades.unshift(trade);
      }
    }

    if (this.recentTrades.length > MAX_TRADE_HISTORY) {
      this.recentTrades.length = MAX_TRADE_HISTORY;
    }

    const payload = JSON.stringify({
      type: "tick",
      quotes: tickQuotes,
      trades: newTrades,
      ts: now,
    });

    for (const listener of this.listeners) {
      try {
        listener(`data: ${payload}\n\n`);
      } catch (err) {
        logger.warn("SSE listener error, removing", "live-ticker", { error: String(err) });
        this.listeners.delete(listener);
      }
    }
  }

  subscribe(listener: (data: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): TickerSnapshot {
    const quotes: TickerQuote[] = [];
    const sparklines: Record<string, number[]> = {};

    for (const config of PAIR_CONFIGS) {
      const price = this.prices.get(config.symbol)!;
      const prevPrice = this.prevPrices.get(config.symbol)!;
      const openPrice = this.openPrices.get(config.symbol)!;
      const change24h = price - openPrice;
      const change24hPct = (change24h / openPrice) * 100;

      quotes.push({
        symbol: config.symbol,
        pair: config.pair,
        price,
        prevPrice,
        change24h,
        change24hPct,
        high24h: this.high24h.get(config.symbol)!,
        low24h: this.low24h.get(config.symbol)!,
        volume24h: this.volume24h.get(config.symbol)!,
        updatedAt: Date.now(),
      });

      sparklines[config.symbol] = [...(this.sparklines.get(config.symbol) || [])];
    }

    return { quotes, sparklines };
  }

  getSparkline(symbol: string): number[] {
    return [...(this.sparklines.get(symbol) || [])];
  }

  getRecentTrades(limit = 20): TradeEvent[] {
    return this.recentTrades.slice(0, limit);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}

export const liveTickerEngine = new LiveTickerEngine();
