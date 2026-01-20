import { describe, expect, it } from "vitest";
import type { Balance, Operation, Position, Vault } from "@shared/schema";
import {
  computeLedgerTotals,
  computeHoldingsTotals,
  reconcileUser,
  validateHoldingsInvariants,
} from "../lib/ledger";

describe("ledger reconciliation", () => {
  it("reconciles ledger totals against holdings", () => {
    const operations: Operation[] = [
      {
        id: "op-1",
        userId: "user-1",
        type: "DEPOSIT_USDT",
        status: "completed",
        asset: "USDT",
        amount: "100000000",
        fee: "0",
        txHash: null,
        providerRef: null,
        strategyId: null,
        strategyName: null,
        fromVault: null,
        toVault: null,
        metadata: null,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "op-2",
        userId: "user-1",
        type: "INVEST",
        status: "completed",
        asset: "USDT",
        amount: "60000000",
        fee: "0",
        txHash: null,
        providerRef: null,
        strategyId: "strategy-1",
        strategyName: "Core",
        fromVault: null,
        toVault: null,
        metadata: null,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "op-3",
        userId: "user-1",
        type: "WITHDRAW_USDT",
        status: "pending",
        asset: "USDT",
        amount: "10000000",
        fee: "1000000",
        txHash: null,
        providerRef: null,
        strategyId: null,
        strategyName: null,
        fromVault: null,
        toVault: null,
        metadata: null,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "op-4",
        userId: "user-1",
        type: "PROFIT_ACCRUAL",
        status: "completed",
        asset: "USDT",
        amount: "5000000",
        fee: "0",
        txHash: null,
        providerRef: null,
        strategyId: "strategy-1",
        strategyName: "Core",
        fromVault: null,
        toVault: null,
        metadata: { date: "2024-01-01" },
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "op-5",
        userId: "user-1",
        type: "VAULT_TRANSFER",
        status: "completed",
        asset: "USDT",
        amount: "4000000",
        fee: "0",
        txHash: null,
        providerRef: null,
        strategyId: null,
        strategyName: null,
        fromVault: "wallet",
        toVault: "profit",
        metadata: null,
        reason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const ledger = computeLedgerTotals(operations);
    expect(ledger.walletAvailableMinor).toBe(25000000n);
    expect(ledger.vaultsMinor.profit).toBe(4000000n);
    expect(ledger.allocatedMinor).toBe(60000000n);
    expect(ledger.pnlMinor).toBe(5000000n);

    const balances: Balance[] = [
      {
        id: "bal-1",
        userId: "user-1",
        asset: "USDT",
        available: "25000000",
        locked: "0",
        updatedAt: new Date(),
      },
    ];
    const vaults: Vault[] = [
      {
        id: "vault-1",
        userId: "user-1",
        type: "profit",
        asset: "USDT",
        balance: "4000000",
        goalName: null,
        goalAmount: null,
        autoSweepPct: 0,
        autoSweepEnabled: false,
        updatedAt: new Date(),
      },
    ];
    const positions: Position[] = [
      {
        id: "pos-1",
        userId: "user-1",
        strategyId: "strategy-1",
        principal: "60000000",
        currentValue: "65000000",
        principalMinor: "60000000",
        investedCurrentMinor: "65000000",
        accruedProfitPayableMinor: "0",
        lastAccrualDate: "2024-01-01",
        paused: false,
        ddLimitPct: 0,
        autoPauseEnabled: false,
        pausedAt: null,
        pausedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const holdings = computeHoldingsTotals({ balances, vaults, positions });
    expect(holdings.availableMinor).toBe(29000000n);
    expect(holdings.allocatedMinor).toBe(60000000n);
    expect(holdings.pnlMinor).toBe(5000000n);
    expect(holdings.equityMinor).toBe(94000000n);

    const result = reconcileUser({
      userId: "user-1",
      operations,
      balances,
      vaults,
      positions,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags invariant violations", () => {
    const holdings = computeHoldingsTotals({
      balances: [
        {
          id: "bal-1",
          userId: "user-1",
          asset: "USDT",
          available: "-10",
          locked: "0",
          updatedAt: new Date(),
        },
      ],
      vaults: [],
      positions: [],
    });

    const issues = validateHoldingsInvariants(holdings);
    expect(issues.some((issue) => issue.code === "WALLET_NEGATIVE")).toBe(true);
  });
});
