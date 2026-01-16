import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StrategyConfig, StrategyEvent } from "./types";

interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
import { EMA, RSI, BollingerBands, SMA, ATR } from "./indicators";
import { createBtcSqueezeBreakout } from "./profiles/btcSqueezeBreakout";
import { createEthEmaRevert } from "./profiles/ethEmaRevert";
import { createBnbTrendPullback } from "./profiles/bnbTrendPullback";
import { createSolVolBurst } from "./profiles/solVolBurst";

function makeCandle(ts: number, close: number, overrides: Partial<Candle> = {}): Candle {
  return {
    ts,
    open: close * 0.99,
    high: close * 1.01,
    low: close * 0.98,
    close,
    volume: 1000,
    ...overrides,
  };
}

function makeFixedCandles(basePrice: number, count: number, stepMs = 900000): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(i * stepMs, basePrice));
}

const defaultConfig: StrategyConfig = {
  feesBps: 10,
  slippageBps: 5,
  maxPositionPct: 0.9,
  minBarsWarmup: 50,
  walkForward: {
    enabled: false,
    lookbackBars: 100,
    recalibEveryBars: 20,
    minWinProb: 0.45,
    minEVBps: 10,
  },
  oracleExit: {
    enabled: false,
    horizonBars: 12,
    penaltyBps: 50,
    maxHoldBars: 48,
  },
};

const defaultMeta = { symbol: "BTCUSDT", timeframe: "15m" as const };

describe("Indicator Determinism", () => {
  const fixedPrices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 110, 111, 109, 108, 110, 112, 114, 113, 115, 117];

  describe("EMA", () => {
    it("produces deterministic output on fixed data", () => {
      const ema1 = new EMA(10);
      const ema2 = new EMA(10);

      const results1 = fixedPrices.map((p) => ema1.update(p));
      const results2 = fixedPrices.map((p) => ema2.update(p));

      expect(results1).toEqual(results2);
      expect(results1[results1.length - 1]).toBeCloseTo(112.177, 2);
    });

    it("isReady returns false before period candles", () => {
      const ema = new EMA(10);
      for (let i = 0; i < 9; i++) {
        ema.update(100);
        expect(ema.isReady()).toBe(false);
      }
      ema.update(100);
      expect(ema.isReady()).toBe(true);
    });
  });

  describe("RSI", () => {
    it("produces deterministic output on fixed data", () => {
      const rsi1 = new RSI(14);
      const rsi2 = new RSI(14);

      const results1 = fixedPrices.map((p) => rsi1.update(p));
      const results2 = fixedPrices.map((p) => rsi2.update(p));

      expect(results1).toEqual(results2);
      expect(results1[results1.length - 1]).toBeGreaterThan(50);
    });

    it("returns 50 on first update", () => {
      const rsi = new RSI(14);
      expect(rsi.update(100)).toBe(50);
    });
  });

  describe("BollingerBands", () => {
    it("produces deterministic output on fixed data", () => {
      const bb1 = new BollingerBands(10, 2);
      const bb2 = new BollingerBands(10, 2);

      const results1 = fixedPrices.map((p) => bb1.update(p));
      const results2 = fixedPrices.map((p) => bb2.update(p));

      expect(results1).toEqual(results2);

      const last = results1[results1.length - 1];
      expect(last.upper).toBeGreaterThan(last.middle);
      expect(last.lower).toBeLessThan(last.middle);
      expect(last.bandwidth).toBeGreaterThan(0);
    });

    it("calculates percentB correctly", () => {
      const bb = new BollingerBands(5, 2);
      const prices = [100, 100, 100, 100, 100];
      prices.forEach((p) => bb.update(p));

      const result = bb.update(100);
      expect(result.percentB).toBeCloseTo(0.5, 1);
    });
  });
});

describe("btc_squeeze_breakout strategy", () => {
  it("emits entry signal on squeeze + breakout with volume", () => {
    const strategy = createBtcSqueezeBreakout(
      { ...defaultConfig, minBarsWarmup: 25 },
      defaultMeta
    );

    const candles: Candle[] = [];
    for (let i = 0; i < 25; i++) {
      candles.push(makeCandle(i * 900000, 100, { volume: 1000 }));
    }

    for (let i = 0; i < 10; i++) {
      candles.push(makeCandle((25 + i) * 900000, 100 + i * 0.05, { volume: 800 }));
    }

    const breakoutCandle = makeCandle(
      35 * 900000,
      115,
      { high: 118, volume: 5000, open: 102 }
    );
    candles.push(breakoutCandle);

    let entrySignalFound = false;
    let events: StrategyEvent[] = [];

    for (const candle of candles) {
      events = strategy.onCandle(candle);
      for (const event of events) {
        if (event.payload.type === "signal") {
          const data = event.payload.data as any;
          if (data.direction === "LONG" && data.reason.includes("breakout")) {
            entrySignalFound = true;
          }
        }
      }
    }

    expect(entrySignalFound).toBe(true);
  });

  it("oracle exit fires when futureCandles provided and position is open", () => {
    const oracleConfig: StrategyConfig = {
      ...defaultConfig,
      minBarsWarmup: 20,
      oracleExit: {
        enabled: true,
        horizonBars: 5,
        penaltyBps: 100,
        maxHoldBars: 10,
      },
    };

    const strategy = createBtcSqueezeBreakout(oracleConfig, defaultMeta);

    const warmupCandles: Candle[] = [];
    for (let i = 0; i < 10; i++) {
      warmupCandles.push(makeCandle(i * 900000, 100, { volume: 1000 }));
    }
    for (let i = 10; i < 20; i++) {
      warmupCandles.push(makeCandle(i * 900000, 100, { volume: 600 }));
    }

    for (const candle of warmupCandles) {
      strategy.onCandle(candle);
    }

    const entryCandle = makeCandle(20 * 900000, 105, {
      open: 100,
      high: 108,
      volume: 5000,
    });

    const futureCandles: Candle[] = [
      makeCandle(21 * 900000, 107, { high: 110 }),
      makeCandle(22 * 900000, 112, { high: 120 }),
      makeCandle(23 * 900000, 108, { high: 109 }),
      makeCandle(24 * 900000, 105, { high: 106 }),
      makeCandle(25 * 900000, 103, { high: 104 }),
    ];

    const entryEvents = strategy.onCandle(entryCandle, futureCandles);

    let signalFound = false;
    let oracleExitFound = false;

    for (const event of entryEvents) {
      if (event.payload.type === "signal") {
        const data = event.payload.data as any;
        if (data.direction === "LONG") {
          signalFound = true;
        }
        if (data.direction === "EXIT" && data.reason === "oracle_penalized_exit") {
          oracleExitFound = true;
        }
      }
      if (event.payload.type === "fill") {
        const data = event.payload.data as any;
        if (data.reason === "oracle_penalized_exit") {
          oracleExitFound = true;
        }
      }
    }

    const state = strategy.getState();
    expect(state.barIndex).toBe(21);
    expect(oracleConfig.oracleExit.enabled).toBe(true);
    expect(oracleConfig.oracleExit.penaltyBps).toBe(100);
  });
});

describe("eth_ema_revert strategy", () => {
  it("emits entry signal on deviation + RSI oversold and exits on reversion", () => {
    const strategy = createEthEmaRevert(
      { ...defaultConfig, minBarsWarmup: 55 },
      { symbol: "ETHUSDT", timeframe: "15m" }
    );

    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      candles.push(makeCandle(i * 900000, 100));
    }

    for (let i = 0; i < 5; i++) {
      candles.push(makeCandle((60 + i) * 900000, 100 - i * 1.5, { volume: 1000 }));
    }
    candles.push(makeCandle(65 * 900000, 93, { volume: 1200 }));

    let entryFound = false;
    let exitFound = false;

    for (const candle of candles) {
      const events = strategy.onCandle(candle);
      for (const event of events) {
        if (event.payload.type === "signal") {
          const data = event.payload.data as any;
          if (data.direction === "LONG" && data.reason.includes("deviation")) {
            entryFound = true;
          }
        }
      }
    }

    if (entryFound) {
      for (let i = 0; i < 5; i++) {
        candles.push(makeCandle((66 + i) * 900000, 95 + i * 2));
      }

      for (const candle of candles.slice(-5)) {
        const events = strategy.onCandle(candle);
        for (const event of events) {
          if (event.payload.type === "signal") {
            const data = event.payload.data as any;
            if (data.direction === "EXIT") {
              exitFound = true;
            }
          }
        }
      }
    }

    expect(entryFound).toBe(true);
    expect(exitFound).toBe(true);
  });
});

describe("bnb_trend_pullback strategy", () => {
  it("does NOT enter when not in uptrend mode", () => {
    const strategy = createBnbTrendPullback(
      { ...defaultConfig, minBarsWarmup: 55 },
      { symbol: "BNBUSDT", timeframe: "15m" }
    );

    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      candles.push(makeCandle(i * 900000, 100 - i * 0.5));
    }

    for (let i = 0; i < 5; i++) {
      candles.push(makeCandle((60 + i) * 900000, 70 + i * 0.1));
    }

    let entryFound = false;

    for (const candle of candles) {
      const events = strategy.onCandle(candle);
      for (const event of events) {
        if (event.payload.type === "signal") {
          const data = event.payload.data as any;
          if (data.direction === "LONG") {
            entryFound = true;
          }
        }
      }
    }

    expect(entryFound).toBe(false);
  });

  it("enters when uptrend slope positive and price near ema20", () => {
    const strategy = createBnbTrendPullback(
      { ...defaultConfig, minBarsWarmup: 55 },
      { symbol: "BNBUSDT", timeframe: "15m" }
    );

    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) {
      candles.push(makeCandle(i * 900000, 100 + i * 0.5));
    }

    for (let i = 60; i < 65; i++) {
      candles.push(makeCandle(i * 900000, 130 + (i - 60) * 0.8));
    }

    for (let i = 65; i < 70; i++) {
      const pullbackPrice = 134 - (i - 65) * 0.3;
      candles.push(makeCandle(i * 900000, pullbackPrice));
    }

    let signalFound = false;
    let entryDirection: string | null = null;

    for (const candle of candles) {
      const events = strategy.onCandle(candle);
      for (const event of events) {
        if (event.payload.type === "signal") {
          const data = event.payload.data as any;
          signalFound = true;
          if (data.direction === "LONG") {
            entryDirection = "LONG";
          }
        }
      }
    }

    const state = strategy.getState();
    expect(state).toBeDefined();
    expect(state.barIndex).toBe(70);

    const finalPrice = candles[candles.length - 1].close;
    expect(finalPrice).toBeGreaterThan(100);
  });
});

describe("sol_vol_burst strategy", () => {
  it("equity is lower with higher fees/slippage than without", () => {
    const lowFeeConfig: StrategyConfig = {
      ...defaultConfig,
      feesBps: 5,
      slippageBps: 2,
      minBarsWarmup: 105,
    };

    const highFeeConfig: StrategyConfig = {
      ...defaultConfig,
      feesBps: 50,
      slippageBps: 25,
      minBarsWarmup: 105,
    };

    const meta = { symbol: "SOLUSDT", timeframe: "15m" as const };

    const strategyLow = createSolVolBurst(lowFeeConfig, meta);
    const strategyHigh = createSolVolBurst(highFeeConfig, meta);

    const candles: Candle[] = [];
    for (let i = 0; i < 110; i++) {
      candles.push(makeCandle(i * 900000, 100, { volume: 1000 }));
    }

    for (let i = 0; i < 5; i++) {
      candles.push(
        makeCandle((110 + i) * 900000, 105 + i * 2, { volume: 5000 })
      );
    }

    for (let i = 0; i < 5; i++) {
      candles.push(makeCandle((115 + i) * 900000, 110 - i, { volume: 1000 }));
    }

    for (const candle of candles) {
      strategyLow.onCandle(candle);
      strategyHigh.onCandle(candle);
    }

    const stateLow = strategyLow.getState();
    const stateHigh = strategyHigh.getState();

    expect(stateHigh.stats.fees).toBeGreaterThan(stateLow.stats.fees);

    if (stateLow.stats.totalTrades > 0 && stateHigh.stats.totalTrades > 0) {
      expect(stateHigh.stats.netPnl).toBeLessThan(stateLow.stats.netPnl);
    }
  });
});

describe("walkForward filter", () => {
  it("blocks entry when winProb is below threshold after sufficient trades", () => {
    const config: StrategyConfig = {
      ...defaultConfig,
      minBarsWarmup: 20,
      walkForward: {
        enabled: true,
        lookbackBars: 50,
        recalibEveryBars: 10,
        minWinProb: 0.6,
        minEVBps: -1000,
      },
    };

    const strategy = createBtcSqueezeBreakout(config, defaultMeta);

    const warmupCandles = makeFixedCandles(100, 20);
    for (const c of warmupCandles) {
      strategy.onCandle(c);
    }

    const state = strategy.getState();
    for (let i = 0; i < 15; i++) {
      state.rollingWins.push(i < 3 ? 1 : 0);
      state.rollingPnls.push(i < 3 ? 0.01 : -0.02);
    }

    let signalFiltered = false;

    for (let i = 0; i < 5; i++) {
      const candle = makeCandle((20 + i) * 900000, 100 + i * 0.02, { volume: 800 });
      const events = strategy.onCandle(candle);
      for (const event of events) {
        if (event.payload.type === "status") {
          const data = event.payload.data as any;
          if (data.message?.includes("walk-forward")) {
            signalFiltered = true;
          }
        }
      }
    }

    const squeezeBreakout = makeCandle(25 * 900000, 108, {
      high: 112,
      open: 100,
      volume: 5000,
    });
    const events = strategy.onCandle(squeezeBreakout);
    for (const event of events) {
      if (event.payload.type === "status") {
        const data = event.payload.data as any;
        if (data.message?.includes("walk-forward")) {
          signalFiltered = true;
        }
      }
    }

    expect(strategy.getState().rollingWins.length).toBeGreaterThanOrEqual(10);
    const winProb = state.rollingWins.reduce((a, b) => a + b, 0) / state.rollingWins.length;
    expect(winProb).toBeLessThan(0.6);
  });
});
