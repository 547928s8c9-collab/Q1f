import { describe, expect, it } from "vitest";
import type { Balance, Position, Strategy, Vault } from "@shared/schema";
import { computeAnalyticsOverview } from "./portfolioAnalytics";

const baseBalance = (asset: string, available: string, locked: string): Balance => ({
  id: `bal-${asset}`,
  userId: "user-1",
  asset,
  available,
  locked,
  updatedAt: new Date(),
});

const baseVault = (balance: string): Vault => ({
  id: "vault-1",
  userId: "user-1",
  asset: "USDT",
  balance,
  type: "yield",
  goalName: null,
  goalAmountMinor: null,
  autoSweepEnabled: false,
  autoSweepPct: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const basePosition = (principalMinor: string, investedCurrentMinor: string): Position => ({
  id: "pos-1",
  userId: "user-1",
  strategyId: "strategy-1",
  principal: principalMinor,
  currentValue: investedCurrentMinor,
  principalMinor,
  investedCurrentMinor,
  accruedProfitPayableMinor: "0",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  paused: false,
  pausedAt: null,
  pausedReason: null,
  ddLimitPct: null,
  autoPauseEnabled: null,
});

const baseStrategy: Strategy = {
  id: "strategy-1",
  name: "Core Yield",
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

describe("computeAnalyticsOverview", () => {
  it("aggregates balances, vaults, and positions into total equity", () => {
    const overview = computeAnalyticsOverview({
      balances: [
        baseBalance("USDT", "100", "50"),
        baseBalance("RUB", "999", "1"),
      ],
      vaults: [baseVault("200")],
      positions: [basePosition("400", "500")],
      portfolioSeries: [
        { date: "2024-01-01", value: "100" },
        { date: "2024-01-02", value: "120" },
      ],
      strategies: [baseStrategy],
    });

    expect(overview.totalEquityMinor).toBe("850");
    expect(overview.strategies[0]).toMatchObject({
      allocatedMinor: "400",
      currentMinor: "500",
      pnlMinor: "100",
    });
  });

  it("is idempotent for the same inputs", () => {
    const input = {
      balances: [baseBalance("USDT", "10", "0")],
      vaults: [baseVault("5")],
      positions: [basePosition("10", "12")],
      portfolioSeries: [
        { date: "2024-01-01", value: "10" },
        { date: "2024-01-02", value: "12" },
      ],
      strategies: [baseStrategy],
    };

    const first = computeAnalyticsOverview(input);
    const second = computeAnalyticsOverview(input);

    expect(second).toEqual(first);
  });
});
