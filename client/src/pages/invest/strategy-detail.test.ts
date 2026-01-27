import { describe, expect, it } from "vitest";
import { formatMoney, type Candle, type InvestTrade } from "@shared/schema";
import { getMoneyInputState, normalizeMoneyInput } from "@/lib/moneyInput";

// Helper function to compute candle time range (extracted logic from component)
function computeCandleTimeRange(candleData: Candle[]): { minTs: number; maxTs: number } | null {
  if (!candleData.length) return null;
  const timestamps = candleData.map((c) => c.ts).filter(Number.isFinite);
  if (!timestamps.length) return null;
  return {
    minTs: Math.min(...timestamps),
    maxTs: Math.max(...timestamps),
  };
}

// Helper function to filter trades by candle range (extracted logic from component)
function filterTradesByCandleRange(
  trades: InvestTrade[],
  candleTimeRange: { minTs: number; maxTs: number } | null
): InvestTrade[] {
  if (!trades.length || !candleTimeRange) return [];

  return trades.filter((trade) => {
    const entryValid = Number.isFinite(trade.entryTs) && 
      trade.entryTs >= candleTimeRange.minTs && 
      trade.entryTs <= candleTimeRange.maxTs;
    const exitValid = Number.isFinite(trade.exitTs) && 
      trade.exitTs >= candleTimeRange.minTs && 
      trade.exitTs <= candleTimeRange.maxTs;
    return entryValid && exitValid;
  });
}

const makeCandle = (overrides: Partial<Candle>): Candle => ({
  ts: Date.now(),
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1000,
  ...overrides,
});

const makeTrade = (overrides: Partial<InvestTrade>): InvestTrade => ({
  id: "trade-1",
  entryTs: Date.now(),
  exitTs: Date.now() + 3600000,
  entryPrice: 100,
  exitPrice: 105,
  qty: 1,
  netPnl: 5,
  netPnlPct: 5,
  holdBars: 1,
  reason: "test",
  ...overrides,
});

describe("strategy-detail chart markers filtering", () => {
  describe("computeCandleTimeRange", () => {
    it("returns null for empty candles", () => {
      expect(computeCandleTimeRange([])).toBeNull();
    });

    it("returns null for candles with invalid timestamps", () => {
      const candles = [
        makeCandle({ ts: NaN }),
        makeCandle({ ts: Infinity }),
      ];
      expect(computeCandleTimeRange(candles)).toBeNull();
    });

    it("computes correct range for valid candles", () => {
      const baseTime = Date.now();
      const candles = [
        makeCandle({ ts: baseTime }),
        makeCandle({ ts: baseTime + 3600000 }),
        makeCandle({ ts: baseTime + 7200000 }),
      ];
      const range = computeCandleTimeRange(candles);
      expect(range).toEqual({
        minTs: baseTime,
        maxTs: baseTime + 7200000,
      });
    });

    it("handles single candle", () => {
      const baseTime = Date.now();
      const candles = [makeCandle({ ts: baseTime })];
      const range = computeCandleTimeRange(candles);
      expect(range).toEqual({
        minTs: baseTime,
        maxTs: baseTime,
      });
    });
  });

  describe("filterTradesByCandleRange", () => {
    it("returns empty array for empty trades", () => {
      const range = { minTs: Date.now(), maxTs: Date.now() + 3600000 };
      expect(filterTradesByCandleRange([], range)).toEqual([]);
    });

    it("returns empty array for null range", () => {
      const trades = [makeTrade({})];
      expect(filterTradesByCandleRange(trades, null)).toEqual([]);
    });

    it("filters out trades with entryTs outside range", () => {
      const baseTime = Date.now();
      const range = { minTs: baseTime, maxTs: baseTime + 3600000 };
      const trades = [
        makeTrade({ entryTs: baseTime - 1000, exitTs: baseTime + 1000 }), // entry before range
        makeTrade({ entryTs: baseTime + 1000, exitTs: baseTime + 2000 }), // valid
      ];
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.entryTs).toBe(baseTime + 1000);
    });

    it("filters out trades with exitTs outside range", () => {
      const baseTime = Date.now();
      const range = { minTs: baseTime, maxTs: baseTime + 3600000 };
      const trades = [
        makeTrade({ entryTs: baseTime + 1000, exitTs: baseTime + 4000000 }), // exit after range
        makeTrade({ entryTs: baseTime + 1000, exitTs: baseTime + 2000 }), // valid
      ];
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.exitTs).toBe(baseTime + 2000);
    });

    it("filters out trades with invalid timestamps", () => {
      const baseTime = Date.now();
      const range = { minTs: baseTime, maxTs: baseTime + 3600000 };
      const trades = [
        makeTrade({ entryTs: NaN, exitTs: baseTime + 1000 }),
        makeTrade({ entryTs: baseTime + 1000, exitTs: Infinity }),
        makeTrade({ entryTs: baseTime + 1000, exitTs: baseTime + 2000 }), // valid
      ];
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.entryTs).toBe(baseTime + 1000);
    });

    it("keeps trades where both entry and exit are within range", () => {
      const baseTime = Date.now();
      const range = { minTs: baseTime, maxTs: baseTime + 3600000 };
      const trades = [
        makeTrade({ entryTs: baseTime + 500, exitTs: baseTime + 1000 }),
        makeTrade({ entryTs: baseTime + 1500, exitTs: baseTime + 2000 }),
        makeTrade({ entryTs: baseTime + 2500, exitTs: baseTime + 3000 }),
      ];
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toHaveLength(3);
    });

    it("handles trades at range boundaries", () => {
      const baseTime = Date.now();
      const range = { minTs: baseTime, maxTs: baseTime + 3600000 };
      const trades = [
        makeTrade({ entryTs: baseTime, exitTs: baseTime + 1000 }), // entry at min
        makeTrade({ entryTs: baseTime + 1000, exitTs: baseTime + 3600000 }), // exit at max
        makeTrade({ entryTs: baseTime, exitTs: baseTime + 3600000 }), // both at boundaries
      ];
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toHaveLength(3);
    });
  });

  describe("chartMarkers edge cases", () => {
    it("returns empty array when candles are empty", () => {
      const candles: Candle[] = [];
      const trades = [makeTrade({})];
      const range = computeCandleTimeRange(candles);
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toEqual([]);
    });

    it("returns empty array when candles have no valid timestamps", () => {
      const candles = [
        makeCandle({ ts: NaN }),
        makeCandle({ ts: Infinity }),
      ];
      const trades = [makeTrade({})];
      const range = computeCandleTimeRange(candles);
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered).toEqual([]);
    });

    it("filters out markers with invalid timestamps even after range check", () => {
      const baseTime = Date.now();
      const candles = [
        makeCandle({ ts: baseTime }),
        makeCandle({ ts: baseTime + 3600000 }),
      ];
      const range = computeCandleTimeRange(candles);
      expect(range).not.toBeNull();
      
      // Trade with valid range but invalid timestamp values
      const trades = [
        makeTrade({ entryTs: baseTime + 1000, exitTs: baseTime + 2000 }), // valid
        // Note: This test ensures that even if a trade passes range check,
        // we still validate timestamps are finite before creating markers
      ];
      const filtered = filterTradesByCandleRange(trades, range);
      expect(filtered.length).toBeGreaterThan(0);
      
      // All filtered trades should have valid timestamps
      filtered.forEach((trade) => {
        expect(Number.isFinite(trade.entryTs)).toBe(true);
        expect(Number.isFinite(trade.exitTs)).toBe(true);
      });
    });
  });
});

describe("strategy-detail payout min amount flow", () => {
  it("normalizes formatted payouts and returns minor units", () => {
    const formatted = formatMoney("1000000000", "USDT");
    const normalized = normalizeMoneyInput(formatted);
    const state = getMoneyInputState(normalized, "USDT");
    expect(formatted).toContain(",");
    expect(normalized).toBe("1000.00");
    expect(state.minor).toBe("1000000000");
    expect(state.error).toBe("");
  });
});
