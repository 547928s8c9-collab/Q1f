import { describe, expect, it } from "vitest";
import type { BootstrapResponse } from "@shared/schema";
import { updateBootstrapAfterTransfer } from "./vaults";

const baseBootstrap = (): BootstrapResponse => ({
  user: {
    id: "user-1",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    profileImageUrl: null,
  },
  onboarding: {
    stage: "done",
    contactVerified: true,
    consentAccepted: true,
    kycStatus: "approved",
  },
  consent: {
    hasAccepted: true,
    currentVersion: "1.0",
    requiredVersion: "1.0",
    needsReaccept: false,
    lastAcceptedAt: null,
  },
  gate: {
    consentRequired: false,
    kycRequired: false,
    canDeposit: true,
    canInvest: true,
    canWithdraw: true,
    reasons: [],
  },
  balances: {
    RUB: { available: "0", locked: "0" },
    USDT: { available: "10000000", locked: "0" },
  },
  invested: {
    current: "0",
    principal: "0",
  },
  vaults: {
    principal: {
      balance: "2000000",
      goalName: "Main",
      goalAmount: "10000000",
      autoSweepPct: 0,
      autoSweepEnabled: false,
      progress: 20,
    },
    profit: {
      balance: "0",
      goalName: null,
      goalAmount: null,
      autoSweepPct: 0,
      autoSweepEnabled: false,
      progress: 0,
    },
    taxes: {
      balance: "0",
      goalName: null,
      goalAmount: null,
      autoSweepPct: 0,
      autoSweepEnabled: false,
      progress: 0,
    },
  },
  portfolioSeries: [],
  quotes: {
    "BTC/USDT": { price: "0", change24h: "0", series: [] },
    "ETH/USDT": { price: "0", change24h: "0", series: [] },
    "USDT/RUB": { price: "0", change24h: "0", series: [] },
  },
  security: {
    id: "security-1",
    userId: "user-1",
    contactVerified: true,
    consentAccepted: true,
    kycStatus: "approved",
    twoFactorEnabled: false,
    antiPhishingCode: null,
    whitelistEnabled: false,
    addressDelay: 0,
    autoSweepEnabled: false,
    updatedAt: new Date(),
  },
  config: {
    depositAddress: "0x123",
    networkFee: "0",
    minWithdrawal: "0",
    minDeposit: "0",
  },
});

describe("updateBootstrapAfterTransfer", () => {
  it("updates wallet and vault balances after a transfer", () => {
    const initial = baseBootstrap();
    const updated = updateBootstrapAfterTransfer(initial, {
      fromVault: "wallet",
      toVault: "principal",
      amount: "1000000",
    });

    expect(updated.balances.USDT.available).toBe("9000000");
    expect(updated.vaults.principal.balance).toBe("3000000");
    expect(updated.vaults.principal.progress).toBeCloseTo(30, 5);
    expect(updated.vaults.profit.balance).toBe("0");
  });
});
