import { describe, expect, it } from "vitest";
import { createBaseStrategy, type SignalGenerator } from "../strategies/executor";
import type { StrategyConfig, StrategyMeta, StrategyState } from "../strategies/types";
import type {
  Candle,
  SimEquitySnapshot,
  SimPosition,
  SimTrade,
  Strategy,
  StrategyProfile,
} from "@shared/schema";
import { alignToGrid } from "../marketData/loadCandles";
import { timeframeToMs } from "../marketData/utils";
import {
  computeDriftPerBar,
  createSimTrader,
  type SimTraderStore,
} from "../services/simTrader";

class TestSignalGenerator implements SignalGenerator {
  private step = 0;

  onCandle(_candle: Candle, state: StrategyState) {
    if (this.step === 0) {
      this.step += 1;
      return { direction: "LONG", reason: "test_entry", indicators: {} };
    }

    if (this.step === 1 && state.position.side === "LONG") {
      this.step += 1;
      return { direction: "EXIT", reason: "test_exit", indicators: {} };
    }

    return null;
  }

  reset() {
    this.step = 0;
  }

  getIndicators() {
    return {};
  }
}

const testConfig: StrategyConfig = {
  feesBps: 5,
  slippageBps: 2,
  maxPositionPct: 0.5,
  minBarsWarmup: 1,
  walkForward: {
    enabled: false,
    lookbackBars: 10,
    recalibEveryBars: 10,
    minWinProb: 0,
    minEVBps: 0,
  },
  oracleExit: {
    enabled: false,
    horizonBars: 0,
    penaltyBps: 0,
    maxHoldBars: 100,
  },
};

function buildStrategyFactory() {
  return (_slug: string, config: StrategyConfig, meta: StrategyMeta) => {
    const signal = new TestSignalGenerator();
    return createBaseStrategy(config, meta, signal);
  };
}

function createMemoryStore(overrides?: {
  position?: SimPosition;
}): SimTraderStore {
  const positions: SimPosition[] = overrides?.position ? [overrides.position] : [];
  const trades: SimTrade[] = [];
  const snapshots: SimEquitySnapshot[] = [];

  const strategy: Strategy = {
    id: "strategy-1",
    name: "Sim Strategy",
    description: "Test",
    riskTier: "CORE",
    baseAsset: "USDT",
    pairsJson: ["BTC/USDT"],
    expectedMonthlyRangeBpsMin: 300,
    expectedMonthlyRangeBpsMax: 600,
    feesJson: { management: "0.5%", performance: "10%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-5%",
    maxDrawdown: "-10%",
    isActive: true,
    createdAt: new Date(),
  };

  const profile: StrategyProfile = {
    id: "profile-1",
    slug: "btc_squeeze_breakout",
    displayName: "BTC Squeeze Breakout",
    symbol: "BTCUSDT",
    timeframe: "15m",
    description: "Test",
    riskLevel: "CORE",
    tags: [],
    defaultConfig: testConfig,
    configSchema: {},
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let idCounter = 0;
  const nextId = () => `id-${idCounter++}`;

  return {
    async getStrategy() {
      return strategy;
    },
    async getProfile() {
      return profile;
    },
    async getPosition() {
      return positions[0] ?? null;
    },
    async upsertPosition(input, id) {
      const now = new Date();
      if (id) {
        const idx = positions.findIndex((p) => p.id === id);
        if (idx >= 0) {
          positions[idx] = { ...positions[idx], ...input, id, updatedAt: now };
          return positions[idx];
        }
      }
      const created = { id: nextId(), ...input, createdAt: now, updatedAt: now } as SimPosition;
      positions[0] = created;
      return created;
    },
    async getOpenTrade() {
      return trades.find((t) => t.status === "OPEN") ?? null;
    },
    async insertTrade(trade) {
      const created = { id: nextId(), ...trade, createdAt: new Date(), updatedAt: new Date() } as SimTrade;
      trades.push(created);
      return created;
    },
    async updateTrade(id, updates) {
      const idx = trades.findIndex((t) => t.id === id);
      trades[idx] = { ...trades[idx], ...updates, updatedAt: new Date() } as SimTrade;
      return trades[idx];
    },
    async insertEquitySnapshot(snapshot) {
      const created = { id: nextId(), ...snapshot, createdAt: new Date() } as SimEquitySnapshot;
      snapshots.push(created);
      return created;
    },
  };
}

describe("computeDriftPerBar", () => {
  it("produces a per-bar drift that sums to the monthly target", () => {
    const perBar = computeDriftPerBar(600, "15m");
    const barsPerMonth = (30 * 24 * 60) / 15;
    const monthly = perBar * barsPerMonth;
    expect(monthly).toBeCloseTo(0.06, 3);
  });
});

describe("SimTrader", () => {
  it("ticks forward and writes trades/positions/snapshots", async () => {
    const stepMs = timeframeToMs("15m");
    const nowAligned = alignToGrid(Date.now(), stepMs);
    const position = {
      id: "pos-1",
      strategyId: "strategy-1",
      profileSlug: "btc_squeeze_breakout",
      symbol: "BTCUSDT",
      timeframe: "15m",
      status: "ACTIVE",
      cashMinor: "10000000000",
      positionSide: "FLAT",
      positionQty: "0",
      positionEntryPrice: "0",
      positionEntryTs: null,
      equityMinor: "10000000000",
      peakEquityMinor: "10000000000",
      lastCandleTs: nowAligned - stepMs * 3,
      lastSnapshotTs: null,
      driftBpsMonthly: 400,
      driftScale: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const store = createMemoryStore({ position });
    const trader = createSimTrader(
      {
        strategyId: "strategy-1",
        profileSlug: "btc_squeeze_breakout",
        strategyConfigOverride: testConfig,
        strategyFactory: buildStrategyFactory(),
        snapshotIntervalMs: stepMs,
      },
      store
    );

    const results = await trader.tickForward(3);
    const closedTrades = results.flatMap((result) => result.tradesClosed);
    const openedTrades = results.flatMap((result) => result.tradesOpened);

    expect(results.length).toBeGreaterThan(0);
    expect(openedTrades.length).toBeGreaterThan(0);
    expect(closedTrades.length).toBeGreaterThan(0);
    expect(results[results.length - 1].position.lastCandleTs).toBe(nowAligned);
    expect(results.some((result) => result.equitySnapshot)).toBe(true);
  });
});
