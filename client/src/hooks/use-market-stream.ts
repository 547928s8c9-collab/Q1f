import { useState, useEffect, useRef, useMemo, useSyncExternalStore, useCallback } from "react";

export interface MarketQuote {
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

export interface MarketTrade {
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

interface MarketStreamSnapshot {
  quotes: Map<string, MarketQuote>;
  sparklines: Map<string, number[]>;
  trades: MarketTrade[];
  connected: boolean;
  version: number;
}

const INITIAL: MarketStreamSnapshot = {
  quotes: new Map(),
  sparklines: new Map(),
  trades: [],
  connected: false,
  version: 0,
};

let singleton: MarketStreamStore | null = null;

class MarketStreamStore {
  private snapshot: MarketStreamSnapshot = { ...INITIAL };
  private listeners = new Set<() => void>();
  private es: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private refCount = 0;

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    this.refCount++;
    if (this.refCount === 1) this.connect();
    return () => {
      this.listeners.delete(cb);
      this.refCount--;
      if (this.refCount <= 0) {
        this.refCount = 0;
        this.disconnect();
      }
    };
  }

  getSnapshot(): MarketStreamSnapshot {
    return this.snapshot;
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  private update(patch: Partial<MarketStreamSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, version: this.snapshot.version + 1 };
    this.emit();
  }

  private connect() {
    this.clearReconnect();
    if (this.es) {
      this.es.close();
      this.es = null;
    }

    const es = new EventSource("/api/market/stream");
    this.es = es;

    es.onopen = () => {
      this.reconnectDelay = 2000;
      this.update({ connected: true });
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "init") {
          const quotes = new Map<string, MarketQuote>();
          for (const q of data.quotes) quotes.set(q.symbol, q);
          const sparklines = new Map<string, number[]>();
          if (data.sparklines) {
            for (const [sym, pts] of Object.entries(data.sparklines)) {
              sparklines.set(sym, pts as number[]);
            }
          }
          this.update({ quotes, sparklines, trades: data.trades || [], connected: true });
        } else if (data.type === "tick") {
          const prev = this.snapshot;
          const newQuotes = new Map(prev.quotes);
          for (const q of data.quotes) newQuotes.set(q.symbol, q);
          const newSparklines = new Map(prev.sparklines);
          for (const q of data.quotes) {
            const existing = newSparklines.get(q.symbol) || [];
            const updated = [...existing, q.price];
            if (updated.length > 96) updated.shift();
            newSparklines.set(q.symbol, updated);
          }
          const newTrades = data.trades?.length
            ? [...data.trades, ...prev.trades].slice(0, 50)
            : prev.trades;
          this.update({ quotes: newQuotes, sparklines: newSparklines, trades: newTrades, connected: true });
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      this.es = null;
      this.update({ connected: false });
      this.scheduleReconnect();
    };
  }

  private disconnect() {
    this.clearReconnect();
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.snapshot = { ...INITIAL };
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    this.clearReconnect();
    if (this.refCount <= 0) return;
    const delay = Math.min(this.reconnectDelay + Math.random() * 500, 15000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.refCount > 0) this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 15000);
  }
}

function getStore(): MarketStreamStore {
  if (!singleton) singleton = new MarketStreamStore();
  return singleton;
}

export function useMarketStream() {
  const store = useMemo(() => getStore(), []);
  const snapshot = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot()
  );

  const quotesArray = useMemo(() => Array.from(snapshot.quotes.values()), [snapshot.quotes]);

  return {
    quotes: quotesArray,
    quotesMap: snapshot.quotes,
    sparklines: snapshot.sparklines,
    trades: snapshot.trades,
    connected: snapshot.connected,
  };
}
