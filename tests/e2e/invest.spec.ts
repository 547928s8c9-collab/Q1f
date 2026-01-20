import { test, expect } from "@playwright/test";

const strategyId = "strategy-1";

const strategy = {
  id: strategyId,
  name: "Core Yield",
  description: "Steady returns with controlled risk.",
  riskTier: "CORE",
  baseAsset: "USDT",
  pairsJson: ["BTC/USDT"],
  expectedMonthlyRangeBpsMin: 300,
  expectedMonthlyRangeBpsMax: 600,
  feesJson: { management: "0.5%", performance: "10%" },
  termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
  minInvestment: "10000000",
  worstMonth: "-5%",
  maxDrawdown: "-10%",
  isActive: true,
  createdAt: new Date().toISOString(),
};

const performance = [
  { id: "perf-1", strategyId, day: 1, date: "2024-01-01", equityMinor: "1000000000" },
  { id: "perf-2", strategyId, day: 2, date: "2024-01-02", equityMinor: "1010000000" },
  { id: "perf-3", strategyId, day: 3, date: "2024-01-03", equityMinor: "1020000000" },
];

const candles = Array.from({ length: 10 }).map((_, index) => ({
  ts: 1700000000000 + index * 900000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100 + index,
  volume: 1000,
}));

const insights = {
  trades: [
    {
      id: "trade-1",
      entryTs: 1700000000000,
      exitTs: 1700000900000,
      entryPrice: 100,
      exitPrice: 101,
      qty: 1,
      netPnl: 1,
      netPnlPct: 1,
      holdBars: 1,
      reason: "signal",
    },
  ],
  metrics: {
    totalTrades: 1,
    winRatePct: 100,
    netPnl: 1,
    netPnlPct: 1,
    grossPnl: 1,
    fees: 0,
    avgHoldBars: 1,
    profitFactor: 1,
    avgTradePnl: 1,
  },
  timeframe: "15m",
  periodDays: 30,
  symbol: "BTCUSDT",
};

async function mockInvestApi(page: import("@playwright/test").Page) {
  let availableBalance = "25000000";

  await page.route("**/api/strategies", async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    return route.fulfill({ json: [strategy] });
  });

  await page.route("**/api/strategies/performance-all", (route) =>
    route.fulfill({ json: { [strategyId]: performance } })
  );

  await page.route(`**/api/strategies/${strategyId}`, (route) =>
    route.fulfill({ json: strategy })
  );

  await page.route(`**/api/strategies/${strategyId}/performance**`, (route) =>
    route.fulfill({ json: performance })
  );

  await page.route(`**/api/invest/strategies/${strategyId}/candles**`, (route) =>
    route.fulfill({
      json: {
        candles,
        gaps: [],
        source: "cache",
        symbol: "BTCUSDT",
        timeframe: "15m",
        periodDays: 30,
      },
    })
  );

  await page.route(`**/api/invest/strategies/${strategyId}/insights**`, (route) =>
    route.fulfill({ json: insights })
  );

  await page.route("**/api/payout-instructions/**", (route) =>
    route.fulfill({ json: null })
  );

  await page.route("**/api/security/whitelist", (route) =>
    route.fulfill({ json: [] })
  );

  await page.route("**/api/positions/**/risk-controls", (route) =>
    route.fulfill({ json: { ddLimitPct: 15, autoPauseEnabled: false, paused: false } })
  );

  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: {
        balances: {
          USDT: { available: availableBalance, locked: "0" },
          RUB: { available: "0", locked: "0" },
        },
        vaults: [],
        positions: [],
        portfolioSeries: [],
        security: null,
        kyc: null,
        consent: null,
        cryptoPrices: { BTC: null, ETH: null },
        config: {},
      },
    })
  );

  await page.route("**/api/invest", async (route) => {
    const body = route.request().postDataJSON() as { amount: string };
    availableBalance = (BigInt(availableBalance) - BigInt(body.amount)).toString();
    return route.fulfill({ json: { success: true, operation: { id: "op-1" } } });
  });
}

test.beforeEach(async ({ page }) => {
  await mockInvestApi(page);
});

test("invest strategies list loads", async ({ page }) => {
  await page.goto("/invest");

  await expect(page.getByTestId(`strategy-card-${strategyId}`)).toBeVisible();
});

test("strategy detail renders charts and metrics", async ({ page }) => {
  await page.goto(`/invest/${strategyId}`);

  await expect(page.getByText("Performance")).toBeVisible();
  await expect(page.getByText("Market Activity")).toBeVisible();
  await expect(page.getByText("Latest index")).toBeVisible();
});

test("invest action updates balances and shows confirmation", async ({ page }) => {
  await page.goto("/invest");

  await page.getByTestId(`button-invest-${strategyId}`).click();
  await page.getByTestId("select-strategy").click();
  await page.getByText(strategy.name).click();
  await page.getByLabel("Amount").fill("10");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Invest" }).click();

  await expect(page.getByText("Investment Complete")).toBeVisible();
});

test("switching timeframe and period updates chart controls", async ({ page }) => {
  await page.goto(`/invest/${strategyId}`);

  await page.getByTestId("select-timeframe").click();
  await page.getByRole("option", { name: "1H" }).click();

  await page.getByTestId("select-period").click();
  await page.getByRole("option", { name: "90D" }).click();

  await expect(page.getByText("90D ·")).toBeVisible();
});
