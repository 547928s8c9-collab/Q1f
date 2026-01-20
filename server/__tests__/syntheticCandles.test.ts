/**
 * Unit tests for synthetic candle generation
 * Tests: bounds [-5%, +5%], OHLC invariants, deterministic seed
 */

import { describe, it, expect } from "vitest";
import { generateSyntheticCandles } from "../services/syntheticMarket";
import type { Candle, Timeframe } from "@shared/schema";

describe("Synthetic Candles", () => {
  const seed = "test-user:test-strategy:BTC/USDT:1h";
  const symbol = "BTC/USDT";
  const timeframe: Timeframe = "1h";
  const fromTs = 1609459200000; // 2021-01-01 00:00:00
  const toTs = fromTs + 24 * 60 * 60 * 1000; // 24 hours

  describe("Bounds validation", () => {
    it("should generate candles with step changes within [-5%, +5%]", () => {
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
        maxStepChangePct: 0.05,
      });

      expect(candles.length).toBeGreaterThan(0);

      for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const curr = candles[i];
        const changePct = (curr.close - prev.close) / prev.close;
        
        expect(changePct).toBeGreaterThanOrEqual(-0.05);
        expect(changePct).toBeLessThanOrEqual(0.05);
      }
    });

    it("should respect custom maxStepChangePct", () => {
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
        maxStepChangePct: 0.02, // 2%
      });

      for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const curr = candles[i];
        const changePct = Math.abs((curr.close - prev.close) / prev.close);
        expect(changePct).toBeLessThanOrEqual(0.02);
      }
    });
  });

  describe("OHLC invariants", () => {
    it("should satisfy OHLC invariants: high >= low, high >= open, high >= close, low <= open, low <= close", () => {
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      for (const candle of candles) {
        expect(candle.high).toBeGreaterThanOrEqual(candle.low);
        expect(candle.high).toBeGreaterThanOrEqual(candle.open);
        expect(candle.high).toBeGreaterThanOrEqual(candle.close);
        expect(candle.low).toBeLessThanOrEqual(candle.open);
        expect(candle.low).toBeLessThanOrEqual(candle.close);
        expect(candle.volume).toBeGreaterThan(0);
        expect(candle.open).toBeGreaterThan(0);
        expect(candle.close).toBeGreaterThan(0);
        expect(candle.high).toBeGreaterThan(0);
        expect(candle.low).toBeGreaterThan(0);
      }
    });

    it("should have no NaN or Infinity values", () => {
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      for (const candle of candles) {
        expect(Number.isNaN(candle.open)).toBe(false);
        expect(Number.isNaN(candle.high)).toBe(false);
        expect(Number.isNaN(candle.low)).toBe(false);
        expect(Number.isNaN(candle.close)).toBe(false);
        expect(Number.isNaN(candle.volume)).toBe(false);
        expect(Number.isFinite(candle.open)).toBe(true);
        expect(Number.isFinite(candle.high)).toBe(true);
        expect(Number.isFinite(candle.low)).toBe(true);
        expect(Number.isFinite(candle.close)).toBe(true);
        expect(Number.isFinite(candle.volume)).toBe(true);
      }
    });
  });

  describe("Determinism", () => {
    it("should generate identical candles for same seed", () => {
      const candles1 = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      const candles2 = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      expect(candles1.length).toBe(candles2.length);

      for (let i = 0; i < candles1.length; i++) {
        expect(candles1[i].ts).toBe(candles2[i].ts);
        expect(candles1[i].open).toBeCloseTo(candles2[i].open, 10);
        expect(candles1[i].high).toBeCloseTo(candles2[i].high, 10);
        expect(candles1[i].low).toBeCloseTo(candles2[i].low, 10);
        expect(candles1[i].close).toBeCloseTo(candles2[i].close, 10);
        expect(candles1[i].volume).toBeCloseTo(candles2[i].volume, 10);
      }
    });

    it("should generate different candles for different seeds", () => {
      const candles1 = generateSyntheticCandles({
        seed: "user1:strategy1:BTC/USDT:1h",
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      const candles2 = generateSyntheticCandles({
        seed: "user2:strategy2:BTC/USDT:1h",
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      // Should have same length but different values
      expect(candles1.length).toBe(candles2.length);
      
      // At least some candles should differ
      const allSame = candles1.every((c1, i) => {
        const c2 = candles2[i];
        return Math.abs(c1.close - c2.close) < 0.0001;
      });
      expect(allSame).toBe(false);
    });
  });

  describe("Timestamp alignment", () => {
    it("should align timestamps to timeframe grid", () => {
      const stepMs = 60 * 60 * 1000; // 1h
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe: "1h",
        fromTs: fromTs + 12345, // Not aligned
        toTs: toTs + 67890, // Not aligned
      });

      for (const candle of candles) {
        expect(candle.ts % stepMs).toBe(0);
      }
    });

    it("should generate consecutive candles without gaps", () => {
      const stepMs = 60 * 60 * 1000; // 1h
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe: "1h",
        fromTs,
        toTs,
      });

      for (let i = 1; i < candles.length; i++) {
        const gap = candles[i].ts - candles[i - 1].ts;
        expect(gap).toBe(stepMs);
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle empty range", () => {
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs: fromTs, // Same as fromTs
      });

      expect(candles.length).toBe(0);
    });

    it("should handle very short range", () => {
      const stepMs = 60 * 60 * 1000; // 1h
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe: "1h",
        fromTs,
        toTs: fromTs + stepMs, // Just one candle
      });

      expect(candles.length).toBe(1);
    });

    it("should not include candle at exclusive end boundary", () => {
      const stepMs = 60 * 60 * 1000; // 1h
      const alignedFromTs = Math.floor(fromTs / stepMs) * stepMs; // Align to grid
      
      // Case 1: toTs exactly on boundary - should NOT include that candle
      const candles1 = generateSyntheticCandles({
        seed,
        symbol,
        timeframe: "1h",
        fromTs: alignedFromTs,
        toTs: alignedFromTs + stepMs, // Exactly one step
      });
      
      expect(candles1.length).toBe(1);
      expect(candles1[0].ts).toBe(alignedFromTs);
      expect(candles1.every(c => c.ts < alignedFromTs + stepMs)).toBe(true);
      
      // Case 2: toTs just before boundary - should NOT include next candle
      const candles2 = generateSyntheticCandles({
        seed,
        symbol,
        timeframe: "1h",
        fromTs: alignedFromTs,
        toTs: alignedFromTs + stepMs - 1, // Just before boundary
      });
      
      expect(candles2.length).toBe(1);
      expect(candles2[0].ts).toBe(alignedFromTs);
      expect(candles2.every(c => c.ts < alignedFromTs + stepMs)).toBe(true);
      
      // Case 3: toTs just after boundary - should include next candle
      const candles3 = generateSyntheticCandles({
        seed,
        symbol,
        timeframe: "1h",
        fromTs: alignedFromTs,
        toTs: alignedFromTs + stepMs + 1, // Just after boundary
      });
      
      expect(candles3.length).toBe(2);
      expect(candles3[0].ts).toBe(alignedFromTs);
      expect(candles3[1].ts).toBe(alignedFromTs + stepMs);
      expect(candles3.every(c => c.ts < alignedFromTs + 2 * stepMs)).toBe(true);
    });

    it("should maintain price continuity across candles", () => {
      const candles = generateSyntheticCandles({
        seed,
        symbol,
        timeframe,
        fromTs,
        toTs,
      });

      for (let i = 1; i < candles.length; i++) {
        const prevClose = candles[i - 1].close;
        const currOpen = candles[i].open;
        // Open should equal previous close (or very close due to rounding)
        expect(Math.abs(currOpen - prevClose) / prevClose).toBeLessThan(0.001);
      }
    });
  });
});
