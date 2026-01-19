import type { RouteDeps } from "./types";
import { storage } from "../storage";
import { buildSimulatedEquity } from "../lib/simulated-equity";

export function registerAnalyticsRoutes(deps: RouteDeps): void {
  const { app, isAuthenticated, getUserId } = deps;

  // GET /api/analytics/overview - Investor analytics summary
  app.get("/api/analytics/overview", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const days = 30;

      // Parallel fetch all required data
      const [balances, vaults, positions, portfolioSeries, allStrategies] = await Promise.all([
        storage.getBalances(userId),
        storage.getVaults(userId),
        storage.getPositions(userId),
        storage.getPortfolioSeries(userId, days),
        storage.getStrategies(),
      ]);

      const uniqueStrategyIds = Array.from(new Set(positions.map((p) => p.strategyId)));
      const performanceEntries = await Promise.all(
        uniqueStrategyIds.map(async (strategyId) => ({
          strategyId,
          performance: await storage.getStrategyPerformance(strategyId, days),
        }))
      );
      const performanceByStrategy = new Map(
        performanceEntries.map(({ strategyId, performance }) => [strategyId, performance])
      );

      const simulatedEquity = buildSimulatedEquity(positions, performanceByStrategy);

      // Build strategy lookup map
      const strategyMap = new Map(allStrategies.map((s) => [s.id, s]));

      // Calculate total equity (real cash + simulated equity)
      let totalEquityMinor = BigInt(0);
      let realCashMinor = BigInt(0);

      // Sum wallet balances (USDT only for now)
      for (const b of balances) {
        if (b.asset === "USDT") {
          realCashMinor += BigInt(b.available || "0") + BigInt(b.locked || "0");
        }
      }

      // Sum vault balances
      for (const v of vaults) {
        if (v.asset === "USDT") {
          realCashMinor += BigInt(v.balance || "0");
        }
      }

      totalEquityMinor = realCashMinor + simulatedEquity.totalCurrentMinor;

      const combinedSeries = simulatedEquity.series.length > 0
        ? simulatedEquity.series.map((point) => ({
          date: point.date,
          value: (realCashMinor + BigInt(point.equityMinor)).toString(),
        }))
        : portfolioSeries.map((s) => ({ date: s.date, value: s.value }));

      // Calculate PnL and ROI from portfolio series
      let pnl30dMinor = BigInt(0);
      let roi30dPct = 0;
      let maxDrawdown30dPct = 0;

      // Sort series by date ascending
      const sortedSeries = [...combinedSeries].sort((a, b) => a.date.localeCompare(b.date));

      if (sortedSeries.length >= 2) {
        const firstValue = BigInt(sortedSeries[0].value || "0");
        const lastValue = BigInt(sortedSeries[sortedSeries.length - 1].value || "0");

        pnl30dMinor = lastValue - firstValue;

        // ROI calculation (convert to number for percentage)
        if (firstValue > 0n) {
          roi30dPct = (Number(lastValue - firstValue) / Number(firstValue)) * 100;
        }

        // Calculate max drawdown
        let peak = BigInt(0);
        let maxDrawdown = 0;

        for (const point of sortedSeries) {
          const value = BigInt(point.value || "0");
          if (value > peak) {
            peak = value;
          }
          if (peak > 0n) {
            const drawdown = Number(peak - value) / Number(peak);
            if (drawdown > maxDrawdown) {
              maxDrawdown = drawdown;
            }
          }
        }

        maxDrawdown30dPct = maxDrawdown * 100;
      }

      // Per-strategy breakdown
      const perStrategy = positions.map((pos) => {
        const strategy = strategyMap.get(pos.strategyId);
        const principal = BigInt(pos.principalMinor || pos.principal || "0");
        const simulatedCurrent = simulatedEquity.perStrategyCurrent.get(pos.strategyId);
        const current = simulatedCurrent ?? BigInt(pos.investedCurrentMinor || pos.currentValue || "0");
        const pnlMinor = current - principal;
        const roiPct = principal > 0n ? (Number(pnlMinor) / Number(principal)) * 100 : 0;

        return {
          strategyId: pos.strategyId,
          name: strategy?.name || "Unknown Strategy",
          riskTier: strategy?.riskTier || "CORE",
          allocatedMinor: pos.principalMinor || "0",
          currentMinor: current.toString(),
          pnlMinor: pnlMinor.toString(),
          roiPct: Math.round(roiPct * 100) / 100,
          accruedProfitMinor: pos.accruedProfitPayableMinor || "0",
          status: pos.paused ? "paused" : "active",
        };
      });

      // Format equity series for response
      const equitySeries = sortedSeries.map((s) => ({
        ts: s.date,
        equityMinor: s.value,
      }));

      res.json({
        updatedAt: new Date().toISOString(),
        totalEquityMinor: totalEquityMinor.toString(),
        metrics: {
          pnl30dMinor: pnl30dMinor.toString(),
          roi30dPct: Math.round(roi30dPct * 100) / 100,
          maxDrawdown30dPct: Math.round(maxDrawdown30dPct * 100) / 100,
          positionsCount: positions.length,
          activePositions: positions.filter((p) => !p.paused).length,
        },
        equitySeries,
        strategies: perStrategy,
      });
    } catch (error) {
      console.error("Analytics overview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
