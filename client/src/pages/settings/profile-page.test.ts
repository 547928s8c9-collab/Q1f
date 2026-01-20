import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PageProvider } from "@/contexts/page-context";
import SettingsProfile from "./profile";
import type { BootstrapResponse } from "@shared/schema";
vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/settings/profile", () => null],
  };
});

const bootstrapFixture: BootstrapResponse = {
  user: {
    id: "user_123",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
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
    currentVersion: "1",
    requiredVersion: "1",
    needsReaccept: false,
    lastAcceptedAt: "2024-01-01T00:00:00.000Z",
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
    principal: {
      balance: "0",
      goalName: null,
      goalAmount: null,
      autoSweepPct: 0,
      autoSweepEnabled: false,
      progress: 0,
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
    id: "sec_1",
    userId: "user_123",
    contactVerified: true,
    consentAccepted: true,
    kycStatus: "approved",
    twoFactorEnabled: false,
    antiPhishingCode: null,
    whitelistEnabled: false,
    addressDelay: 0,
    autoSweepEnabled: false,
    updatedAt: null,
  },
  config: {
    depositAddress: "",
    networkFee: "0",
    minWithdrawal: "0",
    minDeposit: "0",
  },
};

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        retry: false,
        queryFn: async () => {
          throw new Error("Unexpected query");
        },
      },
    },
  });

  queryClient.setQueryData(["/api/bootstrap"], bootstrapFixture);
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(PageProvider, null, React.createElement(SettingsProfile))
    )
  );
}

describe("SettingsProfile", () => {
  it("renders profile details from bootstrap", () => {
    const html = renderProfile();

    expect(html).toContain("Profile");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("ada@example.com");
  });
});
