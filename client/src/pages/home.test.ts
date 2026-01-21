import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BootstrapResponse, VaultData } from "@shared/schema";

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

let VaultsPreview: typeof import("./home").VaultsPreview;
let hasVaultsData: typeof import("./home").hasVaultsData;

beforeAll(async () => {
  globalThis.React = React;
  const module = await import("./home");
  VaultsPreview = module.VaultsPreview;
  hasVaultsData = module.hasVaultsData;
});

const makeVaultData = (balance = "0"): VaultData => ({
  balance,
  goalName: null,
  goalAmount: null,
  autoSweepPct: 0,
  autoSweepEnabled: false,
  progress: 0,
});

const makeBootstrap = (): BootstrapResponse => ({
  user: {
    id: "user-1",
    email: null,
    firstName: null,
    lastName: null,
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
    USDT: { available: "0", locked: "0" },
  },
  invested: {
    current: "0",
    principal: "0",
  },
  vaults: {
    principal: makeVaultData("0"),
    profit: makeVaultData("0"),
    taxes: makeVaultData("0"),
  },
  portfolioSeries: [],
  quotes: {
    "BTC/USDT": { price: "0", change24h: "0", series: [] },
    "ETH/USDT": { price: "0", change24h: "0", series: [] },
    "USDT/RUB": { price: "0", change24h: "0", series: [] },
  },
  security: {
    id: "sec-1",
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
    depositAddress: "",
    networkFee: "0",
    minWithdrawal: "0",
    minDeposit: "0",
  },
});

describe("VaultsPreview", () => {
  it("treats vaults as available even when balances are zero", () => {
    const bootstrap = makeBootstrap();
    expect(hasVaultsData(bootstrap)).toBe(true);
  });

  it("renders all three vault rows in the preview", () => {
    const bootstrap = makeBootstrap();
    const markup = renderToStaticMarkup(
      React.createElement(VaultsPreview, { bootstrap, isLoading: false })
    );

    expect(markup).toContain("Principal");
    expect(markup).toContain("Profit");
    expect(markup).toContain("Taxes");
  });
});
