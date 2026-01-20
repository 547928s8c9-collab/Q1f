import { test, expect, type Page } from "@playwright/test";

async function loginAsDemo(page: Page) {
  await page.request.get("/api/demo-login");
}

async function getFirstStrategyId(page: Page) {
  const card = page.locator('[data-testid^="strategy-card-"]').first();
  await expect(card).toBeVisible();
  const testId = await card.getAttribute("data-testid");
  if (!testId) {
    throw new Error("Strategy card test id not found");
  }
  return testId.replace("strategy-card-", "");
}

test.describe.configure({ mode: "serial" });

test.describe("Invest UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test("strategies list loads", async ({ page }) => {
    await page.goto("/invest");
    await expect(page.getByRole("heading", { name: "Investment Strategies" })).toBeVisible();
    await expect(page.locator('[data-testid^="strategy-card-"]').first()).toBeVisible();
  });

  test("strategy detail renders chart and metrics", async ({ page }) => {
    await page.goto("/invest");
    const strategyId = await getFirstStrategyId(page);

    await page.goto(`/invest/${strategyId}`);
    await expect(page.getByRole("heading", { name: "Market Activity" })).toBeVisible();
    await expect(page.getByTestId("candlestick-chart")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Strategy Metrics" })).toBeVisible();
  });

  test("invest action updates portfolio visibility", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("card-total-equity")).toBeVisible();
    const equityBefore = await page.getByTestId("text-total-equity").innerText();

    await page.goto("/invest");
    const strategyId = await getFirstStrategyId(page);
    await page.getByTestId(`button-invest-${strategyId}`).click();
    await page.getByTestId("input-amount").fill("100");
    await page.getByTestId("button-next-step").click();
    await page.getByTestId("button-confirm").click();
    await expect(page.getByTestId("result-title")).toHaveText(/Investment Complete/i);
    await page.getByTestId("button-close-sheet").click();

    await page.goto("/dashboard");
    await page.getByTestId("button-refresh-dashboard").click();
    await expect(page.getByTestId("text-total-equity")).not.toHaveText(equityBefore);
  });

  test("switching timeframe updates candle chart", async ({ page }) => {
    await page.goto("/invest");
    const strategyId = await getFirstStrategyId(page);
    await page.goto(`/invest/${strategyId}`);

    const footer = page.locator("text=/candles/").first();
    const beforeText = await footer.innerText();

    await page.getByTestId("select-timeframe").click();
    await page.getByRole("option", { name: "1h" }).click();

    await expect(footer).not.toHaveText(beforeText);
  });
});
