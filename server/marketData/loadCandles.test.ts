import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadCandles, findMissingRanges, buildGaps, alignToGrid } from "./loadCandles";
import { storage } from "../storage";
import type { Candle, Timeframe } from "@shared/schema";
import { BinanceSpotDataSource } from "../data/binanceSpot";

const HOUR_MS = 3600000;

function makeCandle(ts: number, overrides: Partial<Candle> = {}): Candle {
  return {
    ts,
    open: 100.0,
    high: 105.0,
    low: 95.0,
    close: 102.0,
    volume: 1000.0,
    ...overrides,
  };
}

describe("alignToGrid", () => {
  it("aligns timestamp to grid", () => {
    expect(alignToGrid(3600001, HOUR_MS)).toBe(3600000);
    expect(alignToGrid(7199999, HOUR_MS)).toBe(3600000);
    expect(alignToGrid(7200000, HOUR_MS)).toBe(7200000);
    expect(alignToGrid(0, HOUR_MS)).toBe(0);
  });
});

describe("findMissingRanges", () => {
  const stepMs = HOUR_MS;

  it("returns full range when no candles exist", () => {
    const ranges = findMissingRanges([], 0, 3 * HOUR_MS, stepMs);
    expect(ranges).toEqual([{ startMs: 0, endMs: 3 * HOUR_MS }]);
  });

  it("returns empty when all candles present", () => {
    const candles = [
      makeCandle(0),
      makeCandle(HOUR_MS),
      makeCandle(2 * HOUR_MS),
    ];
    const ranges = findMissingRanges(candles, 0, 3 * HOUR_MS, stepMs);
    expect(ranges).toEqual([]);
  });

  it("detects single gap in middle", () => {
    const candles = [makeCandle(0), makeCandle(2 * HOUR_MS)];
    const ranges = findMissingRanges(candles, 0, 3 * HOUR_MS, stepMs);
    expect(ranges).toEqual([{ startMs: HOUR_MS, endMs: 2 * HOUR_MS }]);
  });

  it("detects multiple gaps", () => {
    const candles = [makeCandle(0), makeCandle(2 * HOUR_MS), makeCandle(4 * HOUR_MS)];
    const ranges = findMissingRanges(candles, 0, 6 * HOUR_MS, stepMs);
    expect(ranges).toEqual([
      { startMs: HOUR_MS, endMs: 2 * HOUR_MS },
      { startMs: 3 * HOUR_MS, endMs: 4 * HOUR_MS },
      { startMs: 5 * HOUR_MS, endMs: 6 * HOUR_MS },
    ]);
  });

  it("detects gap at start", () => {
    const candles = [makeCandle(2 * HOUR_MS)];
    const ranges = findMissingRanges(candles, 0, 3 * HOUR_MS, stepMs);
    expect(ranges).toEqual([{ startMs: 0, endMs: 2 * HOUR_MS }]);
  });

  it("detects gap at end", () => {
    const candles = [makeCandle(0)];
    const ranges = findMissingRanges(candles, 0, 3 * HOUR_MS, stepMs);
    expect(ranges).toEqual([{ startMs: HOUR_MS, endMs: 3 * HOUR_MS }]);
  });
});

describe("buildGaps", () => {
  const stepMs = HOUR_MS;

  it("returns empty when all candles present", () => {
    const candles = [makeCandle(0), makeCandle(HOUR_MS), makeCandle(2 * HOUR_MS)];
    const gaps = buildGaps(candles, 0, 3 * HOUR_MS, stepMs);
    expect(gaps).toEqual([]);
  });

  it("returns gap with reason for missing candles", () => {
    const candles = [makeCandle(0), makeCandle(2 * HOUR_MS)];
    const gaps = buildGaps(candles, 0, 3 * HOUR_MS, stepMs);
    expect(gaps).toEqual([
      { startMs: HOUR_MS, endMs: 2 * HOUR_MS, reason: "missing_candles_after_retry" },
    ]);
  });

  it("builds multiple gaps correctly", () => {
    const candles = [makeCandle(HOUR_MS)];
    const gaps = buildGaps(candles, 0, 4 * HOUR_MS, stepMs);
    expect(gaps).toEqual([
      { startMs: 0, endMs: HOUR_MS, reason: "missing_candles_after_retry" },
      { startMs: 2 * HOUR_MS, endMs: 4 * HOUR_MS, reason: "missing_candles_after_retry" },
    ]);
  });
});

describe("deduplication and sorting", () => {
  it("deduplicates and sorts candles by ts asc", async () => {
    const exchange = "test_exchange";
    const symbol = "TESTUSDT";
    const timeframe: Timeframe = "1h";

    const candles: Candle[] = [
      makeCandle(2 * HOUR_MS, { close: 200.0 }),
      makeCandle(0, { close: 100.0 }),
      makeCandle(HOUR_MS, { close: 150.0 }),
      makeCandle(0, { close: 100.5 }),
    ];

    await storage.upsertCandles(exchange, symbol, timeframe, candles);

    const result = await storage.getCandlesFromCache(exchange, symbol, timeframe, 0, 3 * HOUR_MS);

    expect(result.length).toBe(3);
    expect(result[0].ts).toBe(0);
    expect(result[1].ts).toBe(HOUR_MS);
    expect(result[2].ts).toBe(2 * HOUR_MS);
    expect(result.map((c) => c.ts)).toEqual([0, HOUR_MS, 2 * HOUR_MS]);
  });
});

describe("upsert idempotency", () => {
  it("does not create duplicates on repeated upsert", async () => {
    const exchange = "test_exchange_2";
    const symbol = "IDEMPOTENT";
    const timeframe: Timeframe = "1h";

    const candles: Candle[] = [
      makeCandle(0, { close: 100.0 }),
      makeCandle(HOUR_MS, { close: 110.0 }),
    ];

    await storage.upsertCandles(exchange, symbol, timeframe, candles);
    const firstResult = await storage.getCandlesFromCache(exchange, symbol, timeframe, 0, 2 * HOUR_MS);
    const firstCount = firstResult.length;

    await storage.upsertCandles(exchange, symbol, timeframe, candles);
    const secondResult = await storage.getCandlesFromCache(exchange, symbol, timeframe, 0, 2 * HOUR_MS);

    expect(secondResult.length).toBe(firstCount);
    expect(secondResult.length).toBe(2);
  });

  it("updates values on conflict", async () => {
    const exchange = "test_exchange_3";
    const symbol = "UPDATETEST";
    const timeframe: Timeframe = "1h";

    const original: Candle[] = [makeCandle(0, { close: 100.0 })];
    await storage.upsertCandles(exchange, symbol, timeframe, original);

    const updated: Candle[] = [makeCandle(0, { close: 999.99 })];
    await storage.upsertCandles(exchange, symbol, timeframe, updated);

    const result = await storage.getCandlesFromCache(exchange, symbol, timeframe, 0, HOUR_MS);
    expect(result.length).toBe(1);
    expect(result[0].close).toBe(999.99);
  });
});

describe("range filtering [start, end)", () => {
  it("correctly filters by half-open interval", async () => {
    const exchange = "test_exchange_4";
    const symbol = "RANGETEST";
    const timeframe: Timeframe = "1h";

    const candles: Candle[] = [
      makeCandle(0),
      makeCandle(HOUR_MS),
      makeCandle(2 * HOUR_MS),
      makeCandle(3 * HOUR_MS),
    ];

    await storage.upsertCandles(exchange, symbol, timeframe, candles);

    const result = await storage.getCandlesFromCache(exchange, symbol, timeframe, HOUR_MS, 3 * HOUR_MS);

    expect(result.length).toBe(2);
    expect(result[0].ts).toBe(HOUR_MS);
    expect(result[1].ts).toBe(2 * HOUR_MS);
  });

  it("excludes end boundary", async () => {
    const exchange = "test_exchange_5";
    const symbol = "BOUNDARY";
    const timeframe: Timeframe = "1h";

    const candles: Candle[] = [makeCandle(0), makeCandle(HOUR_MS)];
    await storage.upsertCandles(exchange, symbol, timeframe, candles);

    const result = await storage.getCandlesFromCache(exchange, symbol, timeframe, 0, HOUR_MS);

    expect(result.length).toBe(1);
    expect(result[0].ts).toBe(0);
  });

  it("includes start boundary", async () => {
    const exchange = "test_exchange_6";
    const symbol = "STARTBOUND";
    const timeframe: Timeframe = "1h";

    const candles: Candle[] = [makeCandle(HOUR_MS), makeCandle(2 * HOUR_MS)];
    await storage.upsertCandles(exchange, symbol, timeframe, candles);

    const result = await storage.getCandlesFromCache(exchange, symbol, timeframe, HOUR_MS, 3 * HOUR_MS);

    expect(result.length).toBe(2);
    expect(result[0].ts).toBe(HOUR_MS);
  });
});

describe("loadCandles determinism", () => {
  it("returns same output for same input with mocked datasource", async () => {
    const mockDataSource: BinanceSpotDataSource = {
      fetchCandles: vi.fn().mockResolvedValue([
        makeCandle(0),
        makeCandle(HOUR_MS),
        makeCandle(2 * HOUR_MS),
      ]),
    } as unknown as BinanceSpotDataSource;

    const params = {
      exchange: "determinism_test",
      symbol: "DETUSDT",
      timeframe: "1h" as Timeframe,
      startMs: 0,
      endMs: 3 * HOUR_MS,
      dataSource: mockDataSource,
    };

    const result1 = await loadCandles(params);
    const result2 = await loadCandles(params);

    expect(result1.candles.length).toBe(result2.candles.length);
    expect(result1.gaps).toEqual(result2.gaps);
    expect(result1.candles.map((c) => c.ts)).toEqual(result2.candles.map((c) => c.ts));
  });

  it("returns source=cache on second call after cache populated", async () => {
    const uniqueTs = Date.now();
    const startMs = alignToGrid(uniqueTs, HOUR_MS);
    const endMs = startMs + 3 * HOUR_MS;

    const mockDataSource: BinanceSpotDataSource = {
      fetchCandles: vi.fn().mockResolvedValue([
        makeCandle(startMs),
        makeCandle(startMs + HOUR_MS),
        makeCandle(startMs + 2 * HOUR_MS),
      ]),
    } as unknown as BinanceSpotDataSource;

    const params = {
      exchange: "cache_test_unique",
      symbol: `CACHE_${uniqueTs}`,
      timeframe: "1h" as Timeframe,
      startMs,
      endMs,
      dataSource: mockDataSource,
    };

    const result1 = await loadCandles(params);
    expect(result1.source).toBe(`cache+${params.exchange}`);
    expect(mockDataSource.fetchCandles).toHaveBeenCalledTimes(1);

    const result2 = await loadCandles(params);
    expect(result2.source).toBe("cache");
    expect(mockDataSource.fetchCandles).toHaveBeenCalledTimes(1);

    expect(result1.candles.length).toBe(result2.candles.length);
  });

  it("fills gaps correctly when datasource returns partial data", async () => {
    const mockDataSource: BinanceSpotDataSource = {
      fetchCandles: vi.fn().mockResolvedValue([
        makeCandle(20 * HOUR_MS),
        makeCandle(22 * HOUR_MS),
      ]),
    } as unknown as BinanceSpotDataSource;

    const params = {
      exchange: "partial_test",
      symbol: "PARTIALSYM",
      timeframe: "1h" as Timeframe,
      startMs: 20 * HOUR_MS,
      endMs: 24 * HOUR_MS,
      dataSource: mockDataSource,
    };

    const result = await loadCandles(params);

    expect(result.candles.length).toBe(2);
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps.some((g) => g.startMs === 21 * HOUR_MS)).toBe(true);
    expect(result.source).toBe(`cache+${params.exchange}`);
  });
});
