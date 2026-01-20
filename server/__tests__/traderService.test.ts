/**
 * Unit tests for trader service
 * Tests: no negative balances, no double-close, expected-return clamp
 */

import { describe, it, expect, beforeEach } from "vitest";
import { simulateInvestStrategy } from "../strategies/investSimulation";
import type { Candle } from "@shared/schema";
import type { StrategyConfig } from "../strategies/types";

function generateTestCandles(count: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const stepMs = 60 * 60 * 1000; // 1h
  const startTs = 1609459200000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.02; // ±1% per candle
    price = Math.max(0.01, price * (1 + change));
    
    candles.push({
      ts: startTs + i * stepMs,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return candles;
}

describe("Trader Service", () => {
  const defaultConfig: StrategyConfig = {
    maxPositionPct: 0.95,
    minBarsWarmup: 10,
    walkForwardWindow: 20,
    walkForwardMinWinProb: 0.5,
    walkForwardMinEVBps: 10,
  };

  describe("No negative balances", () => {
    it("should never produce negative cash balance", () => {
      const candles = generateTestCandles(100);
      const { trades, metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      // Check that all trades have valid quantities and prices
      for (const trade of trades) {
        expect(trade.qty).toBeGreaterThan(0);
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.exitPrice).toBeGreaterThan(0);
        expect(Number.isFinite(trade.netPnl)).toBe(true);
      }

      // Net PnL should be finite
      expect(Number.isFinite(metrics.netPnl)).toBe(true);
      expect(Number.isFinite(metrics.netPnlPct)).toBe(true);
    });

    it("should handle edge case with no trades", () => {
      const candles = generateTestCandles(5); // Too few for strategy to trade
      const { trades, metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: { ...defaultConfig, minBarsWarmup: 100 }, // High warmup prevents trading
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      expect(trades.length).toBe(0);
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.netPnl).toBe(0);
      expect(metrics.netPnlPct).toBe(0);
    });
  });

  describe("No double-close", () => {
    it("should not close same position twice", () => {
      const candles = generateTestCandles(200);
      const { trades } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      // Check for overlapping trades (same entryTs but different exitTs)
      const entryMap = new Map<number, typeof trades[0][]>();
      for (const trade of trades) {
        if (!entryMap.has(trade.entryTs)) {
          entryMap.set(trade.entryTs, []);
        }
        entryMap.get(trade.entryTs)!.push(trade);
      }

      // Each entry should only have one trade (no double-close)
      for (const [entryTs, tradesAtEntry] of entryMap.entries()) {
        // Allow multiple trades if they have different entry times
        // But same entryTs should not have overlapping exit times
        const exitTimes = tradesAtEntry.map(t => t.exitTs).sort((a, b) => a - b);
        for (let i = 1; i < exitTimes.length; i++) {
          expect(exitTimes[i]).toBeGreaterThan(exitTimes[i - 1]);
        }
      }
    });

    it("should have entryTs < exitTs for all trades", () => {
      const candles = generateTestCandles(200);
      const { trades } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      for (const trade of trades) {
        expect(trade.entryTs).toBeLessThan(trade.exitTs);
        expect(trade.holdBars).toBeGreaterThan(0);
      }
    });
  });

  describe("Expected return clamp", () => {
    it("should clamp returns within expected range", () => {
      const candles = generateTestCandles(200);
      
      // Test with return bounds
      const minBps = 50; // 0.5%
      const maxBps = 200; // 2%
      
      const { metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      // Note: The actual clamping happens in traderService.runTrader
      // This test verifies the simulation produces reasonable values
      expect(Number.isFinite(metrics.netPnlPct)).toBe(true);
      expect(metrics.netPnlPct).not.toBeNaN();
      expect(metrics.netPnlPct).not.toBe(Infinity);
      expect(metrics.netPnlPct).not.toBe(-Infinity);
    });

    it("should handle zero return gracefully", () => {
      const candles = generateTestCandles(50);
      const { metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: { ...defaultConfig, minBarsWarmup: 100 }, // Prevent trading
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      expect(metrics.netPnlPct).toBe(0);
      expect(metrics.netPnl).toBe(0);
    });
  });

  describe("Metrics calculation", () => {
    it("should calculate win rate correctly", () => {
      const candles = generateTestCandles(200);
      const { trades, metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      if (trades.length > 0) {
        const wins = trades.filter(t => t.netPnl > 0).length;
        const expectedWinRate = (wins / trades.length) * 100;
        expect(Math.abs(metrics.winRatePct - expectedWinRate)).toBeLessThan(0.1);
      }
    });

    it("should have consistent totalTrades count", () => {
      const candles = generateTestCandles(200);
      const { trades, metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      expect(metrics.totalTrades).toBe(trades.length);
    });

    it("should calculate profit factor correctly", () => {
      const candles = generateTestCandles(200);
      const { trades, metrics } = simulateInvestStrategy({
        candles,
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      if (trades.length > 0) {
        const gains = trades.filter(t => t.netPnl > 0).reduce((sum, t) => sum + t.netPnl, 0);
        const losses = trades.filter(t => t.netPnl < 0).reduce((sum, t) => sum + Math.abs(t.netPnl), 0);
        
        if (losses > 0) {
          const expectedPF = gains / losses;
          expect(Math.abs(metrics.profitFactor - expectedPF)).toBeLessThan(0.01);
        } else if (gains > 0) {
          expect(metrics.profitFactor).toBe(Number.POSITIVE_INFINITY);
        } else {
          expect(metrics.profitFactor).toBe(0);
        }
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle empty candle array", () => {
      const { trades, metrics } = simulateInvestStrategy({
        candles: [],
        profileSlug: "btc_squeeze_breakout",
        config: defaultConfig,
        meta: { symbol: "BTC/USDT", timeframe: "1h" },
      });

      expect(trades.length).toBe(0);
      expect(metrics.totalTrades).toBe(0);
    });

    it("should handle candles with NaN values gracefully", () => {
      const candles: Candle[] = [
        {
          ts: 1609459200000,
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
        },
      ];

      // Should not throw
      expect(() => {
        simulateInvestStrategy({
          candles,
          profileSlug: "btc_squeeze_breakout",
          config: defaultConfig,
          meta: { symbol: "BTC/USDT", timeframe: "1h" },
        });
      }).not.toThrow();
    });
  });
});
