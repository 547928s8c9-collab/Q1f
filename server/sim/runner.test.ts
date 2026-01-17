import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import type { SimSession, StrategyProfileConfig } from "../../shared/schema";
import { SimSessionStatus } from "../../shared/schema";
import { describeWithDb } from "../test/utils/requireDb";

vi.mock("../marketData/loadCandles", () => ({
  loadCandles: vi.fn(),
}));

vi.mock("../strategies/factory", () => ({
  createStrategy: vi.fn(() => ({
    onCandle: vi.fn(() => []),
    getState: vi.fn(() => ({ barIndex: 0, equity: 10000, cash: 10000, position: { side: "FLAT" } })),
    reset: vi.fn(),
  })),
}));

import type { sessionRunner as sessionRunnerInstance } from "./runner";
import type { loadCandles as loadCandlesFn } from "../marketData/loadCandles";
import type { createStrategy as createStrategyFn } from "../strategies/factory";

interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function makeCandle(ts: number, close: number = 100): Candle {
  return {
    ts,
    open: close * 0.99,
    high: close * 1.01,
    low: close * 0.98,
    close,
    volume: 1000,
  };
}

function makeSession(overrides: Partial<SimSession> = {}): SimSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: "test-user",
    profileSlug: "btc_squeeze_breakout",
    symbol: "BTCUSDT",
    timeframe: "15m",
    startMs: 0,
    endMs: 10 * 900000,
    speed: 100,
    status: SimSessionStatus.CREATED,
    lastSeq: 0,
    configOverrides: null,
    idempotencyKey: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const defaultConfig: StrategyProfileConfig = {
  feesBps: 10,
  slippageBps: 5,
  maxPositionPct: 0.9,
  minBarsWarmup: 5,
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

let sessionRunner!: typeof sessionRunnerInstance;
let loadCandles!: typeof loadCandlesFn;
let createStrategy!: typeof createStrategyFn;

describeWithDb("SessionRunner db suites", () => {
  beforeAll(async () => {
    ({ sessionRunner } = await import("./runner"));
    ({ loadCandles } = await import("../marketData/loadCandles"));
    ({ createStrategy } = await import("../strategies/factory"));
  });
describe("SessionRunner seq uniqueness", () => {
  let collectedSeqs: number[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();

    collectedSeqs = [];

    const candles = Array.from({ length: 15 }, (_, i) => makeCandle(i * 900000, 100 + i));
    (loadCandles as any).mockResolvedValue({ candles, gaps: [] });

    let eventSeq = 0;
    (createStrategy as any).mockReturnValue({
      onCandle: vi.fn(() => {
        eventSeq++;
        return [
          {
            ts: Date.now(),
            seq: eventSeq,
            payload: { type: "candle", data: {} },
          },
        ];
      }),
      getState: vi.fn(() => ({
        barIndex: 0,
        equity: 10000,
        cash: 10000,
        position: { side: "FLAT" },
      })),
      reset: vi.fn(),
    });

    sessionRunner.setEventCallback(async (_sessionId, event) => {
      collectedSeqs.push(event.seq);
    });

    sessionRunner.setStatusChangeCallback(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("seq increments strictly by +1 without duplicates", async () => {
    const session = makeSession();

    const result = await sessionRunner.startSession(session, defaultConfig);
    expect(result.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    sessionRunner.stop(session.id);

    expect(collectedSeqs.length).toBeGreaterThan(0);

    for (let i = 1; i < collectedSeqs.length; i++) {
      expect(collectedSeqs[i]).toBe(collectedSeqs[i - 1] + 1);
    }

    const uniqueSeqs = new Set(collectedSeqs);
    expect(uniqueSeqs.size).toBe(collectedSeqs.length);
  });

  it("persists UNIQUE(sessionId, seq) constraint simulation", async () => {
    const seqMap = new Map<string, Set<number>>();

    const session = makeSession();

    sessionRunner.setEventCallback(async (sessionId, event) => {
      if (!seqMap.has(sessionId)) {
        seqMap.set(sessionId, new Set());
      }
      const seqs = seqMap.get(sessionId)!;

      expect(seqs.has(event.seq)).toBe(false);

      seqs.add(event.seq);
    });

    await sessionRunner.startSession(session, defaultConfig);

    await new Promise((resolve) => setTimeout(resolve, 300));

    sessionRunner.stop(session.id);

    const seqs = seqMap.get(session.id);
    expect(seqs).toBeDefined();
    expect(seqs!.size).toBeGreaterThan(0);
  });
});

describe("SessionRunner control flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const candles = Array.from({ length: 20 }, (_, i) => makeCandle(i * 900000, 100));
    (loadCandles as any).mockResolvedValue({ candles, gaps: [] });

    (createStrategy as any).mockReturnValue({
      onCandle: vi.fn(() => []),
      getState: vi.fn(() => ({
        barIndex: 0,
        equity: 10000,
        cash: 10000,
        position: { side: "FLAT" },
      })),
      reset: vi.fn(),
    });

    sessionRunner.setEventCallback(async () => {});
    sessionRunner.setStatusChangeCallback(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pause stops tick processing", async () => {
    const session = makeSession();
    await sessionRunner.startSession(session, defaultConfig);

    expect(sessionRunner.isRunning(session.id)).toBe(true);

    const paused = sessionRunner.pause(session.id);
    expect(paused).toBe(true);

    sessionRunner.stop(session.id);
  });

  it("resume continues after pause", async () => {
    const session = makeSession();
    await sessionRunner.startSession(session, defaultConfig);

    sessionRunner.pause(session.id);
    const resumed = sessionRunner.resume(session.id);
    expect(resumed).toBe(true);

    sessionRunner.stop(session.id);
  });

  it("stop terminates session", async () => {
    const session = makeSession();
    await sessionRunner.startSession(session, defaultConfig);

    const stopped = sessionRunner.stop(session.id);
    expect(stopped).toBe(true);
    expect(sessionRunner.isRunning(session.id)).toBe(false);
  });
});

describe("SessionRunner look-ahead guard", () => {
  const originalOracleEnv = process.env.SIM_ALLOW_ORACLE_EXIT;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.SIM_ALLOW_ORACLE_EXIT;

    const candles = Array.from({ length: 20 }, (_, i) => makeCandle(i * 900000, 100 + i));
    (loadCandles as any).mockResolvedValue({ candles, gaps: [] });

    sessionRunner.setEventCallback(async () => {});
    sessionRunner.setStatusChangeCallback(async () => {});
  });

  afterEach(() => {
    if (originalOracleEnv === undefined) {
      delete process.env.SIM_ALLOW_ORACLE_EXIT;
    } else {
      process.env.SIM_ALLOW_ORACLE_EXIT = originalOracleEnv;
    }
    vi.restoreAllMocks();
  });

  it("does not pass futureCandles in normal replay mode", async () => {
    const futureArgs: (Candle[] | undefined)[] = [];
    (createStrategy as any).mockReturnValue({
      onCandle: vi.fn((_candle: Candle, futureCandles?: Candle[]) => {
        futureArgs.push(futureCandles);
        return [];
      }),
      getState: vi.fn(() => ({
        barIndex: 0,
        equity: 10000,
        cash: 10000,
        position: { side: "FLAT" },
      })),
      reset: vi.fn(),
    });

    const session = makeSession();
    const config: StrategyProfileConfig = {
      ...defaultConfig,
      oracleExit: { ...defaultConfig.oracleExit, enabled: true },
    };

    await sessionRunner.startSession(session, config);
    await new Promise((resolve) => setTimeout(resolve, 200));
    sessionRunner.stop(session.id);

    expect(futureArgs.length).toBeGreaterThan(0);
    for (const arg of futureArgs) {
      expect(arg).toBeUndefined();
    }
  });
});
});
