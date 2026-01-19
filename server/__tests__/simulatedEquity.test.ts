import { describe, it, expect } from "vitest";
import type { Position, StrategyPerformance } from "@shared/schema";
import { buildSimulatedEquity } from "../lib/simulated-equity";

const buildPosition = (overrides: Partial<Position>): Position => ({
  id: "pos-1",
  userId: "user-1",
  strategyId: "strategy-1",
  principal: "0",
  currentValue: "0",
  principalMinor: "0",
  investedCurrentMinor: "0",
  accruedProfitPayableMinor: "0",
  lastAccrualDate: null,
  paused: false,
  ddLimitPct: 0,
  autoPauseEnabled: false,
  pausedAt: null,
  pausedReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const buildPerformance = (overrides: Partial<StrategyPerformance>): StrategyPerformance => ({
  id: "perf-1",
  strategyId: "strategy-1",
  day: 1,
  date: "2024-01-01",
  equityMinor: "1000000000",
  benchmarkBtcMinor: null,
  benchmarkEthMinor: null,
  ...overrides,
});

describe("buildSimulatedEquity", () => {
  it("scales equity snapshots by principal and aggregates series totals", () => {
    const positions = [
      buildPosition({ strategyId: "alpha", principalMinor: "2000000000" }),
      buildPosition({ strategyId: "beta", principalMinor: "1000000000" }),
    ];

    const performanceByStrategy = new Map<string, StrategyPerformance[]>([
      [
        "alpha",
        [
          buildPerformance({ strategyId: "alpha", day: 1, date: "2024-01-01", equityMinor: "1000000000" }),
          buildPerformance({ strategyId: "alpha", day: 2, date: "2024-01-02", equityMinor: "1100000000" }),
        ],
      ],
      [
        "beta",
        [
          buildPerformance({ strategyId: "beta", day: 1, date: "2024-01-01", equityMinor: "1000000000" }),
          buildPerformance({ strategyId: "beta", day: 2, date: "2024-01-02", equityMinor: "900000000" }),
        ],
      ],
    ]);

    const result = buildSimulatedEquity(positions, performanceByStrategy);

    expect(result.totalPrincipalMinor).toBe(3000000000n);
    expect(result.totalCurrentMinor).toBe(3100000000n);
    expect(result.series).toEqual([
      { date: "2024-01-01", equityMinor: "3000000000" },
      { date: "2024-01-02", equityMinor: "3100000000" },
    ]);
  });

  it("falls back to stored current values when no performance exists", () => {
    const positions = [
      buildPosition({
        strategyId: "gamma",
        principalMinor: "500000000",
        investedCurrentMinor: "520000000",
      }),
    ];
    const performanceByStrategy = new Map<string, StrategyPerformance[]>();

    const result = buildSimulatedEquity(positions, performanceByStrategy);

    expect(result.totalCurrentMinor).toBe(520000000n);
    expect(result.series).toEqual([]);
  });
});
