import type { RouteDeps } from "./types";
import { storage } from "../storage";

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

      // Build strategy lookup map
      const strategyMap = new Map(allStrategies.map((s) => [s.id, s]));

      // Calculate total equity (balances + vaults + positions)
      let totalEquityMinor = BigInt(0);

      // Sum wallet balances (USDT only for now)
      for (const b of balances) {
        if (b.asset === "USDT") {
          totalEquityMinor += BigInt(b.available || "0") + BigInt(b.locked || "0");
        }
      }

      // Sum vault balances
      for (const v of vaults) {
        if (v.asset === "USDT") {
          totalEquityMinor += BigInt(v.balance || "0");
        }
      }

      // Sum positions (investedCurrentMinor = current value including gains/losses)
      for (const p of positions) {
        totalEquityMinor += BigInt(p.investedCurrentMinor || "0");
      }

      // Calculate PnL and ROI from portfolio series
      let pnl30dMinor = BigInt(0);
      let roi30dPct = 0;
      let maxDrawdown30dPct = 0;

      // Sort series by date ascending
      const sortedSeries = [...portfolioSeries].sort((a, b) => a.date.localeCompare(b.date));

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
        const principal = BigInt(pos.principalMinor || "0");
        const current = BigInt(pos.investedCurrentMinor || "0");
        const pnlMinor = current - principal;
        const roiPct = principal > 0n ? (Number(pnlMinor) / Number(principal)) * 100 : 0;

        return {
          strategyId: pos.strategyId,
          name: strategy?.name || "Unknown Strategy",
          riskTier: strategy?.riskTier || "CORE",
          allocatedMinor: pos.principalMinor || "0",
          currentMinor: pos.investedCurrentMinor || "0",
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
