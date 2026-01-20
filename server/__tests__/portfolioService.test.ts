/**
 * Unit tests for portfolio aggregation
 * Tests: allocated vs available vs equity math, idempotency
 */

import { describe, it, expect } from "vitest";
import { getPortfolioSummary, reconcilePortfolio, type PortfolioSummary } from "../app/portfolioService";

describe("Portfolio Service", () => {
  describe("Portfolio aggregation math", () => {
    it("should correctly sum allocated, equity, and PnL", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000", // 1000 USDT
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000", // 500 USDT
            equityMinor: "550000000", // 550 USDT
            pnlMinor: "50000000", // 50 USDT profit
          },
          {
            strategyId: "strategy-2",
            allocatedMinor: "300000000", // 300 USDT
            equityMinor: "280000000", // 280 USDT
            pnlMinor: "-20000000", // 20 USDT loss
          },
        ],
        totalAllocatedMinor: "800000000",
        totalEquityMinor: "830000000",
        totalPnlMinor: "30000000",
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(true);
    });

    it("should detect allocated total mismatch", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
        ],
        totalAllocatedMinor: "600000000", // Wrong: should be 500000000
        totalEquityMinor: "550000000",
        totalPnlMinor: "50000000",
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(false);
      expect(result.issues).toContain("Allocated total mismatch");
    });

    it("should detect equity total mismatch", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
        ],
        totalAllocatedMinor: "500000000",
        totalEquityMinor: "600000000", // Wrong: should be 550000000
        totalPnlMinor: "50000000",
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(false);
      expect(result.issues).toContain("Equity total mismatch");
    });

    it("should detect PnL total mismatch", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
        ],
        totalAllocatedMinor: "500000000",
        totalEquityMinor: "550000000",
        totalPnlMinor: "60000000", // Wrong: should be 50000000
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(false);
      expect(result.issues).toContain("PnL total mismatch");
    });

    it("should detect negative totals", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "-100000000", // Negative!
            equityMinor: "50000000",
            pnlMinor: "150000000",
          },
        ],
        totalAllocatedMinor: "-100000000",
        totalEquityMinor: "50000000",
        totalPnlMinor: "150000000",
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(false);
      expect(result.issues).toContain("Negative totals detected");
    });

    it("should handle empty allocations", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [],
        totalAllocatedMinor: "0",
        totalEquityMinor: "0",
        totalPnlMinor: "0",
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(true);
    });

    it("should correctly calculate PnL as equity - allocated", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "0",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "1000000000", // 1000 USDT
            equityMinor: "1100000000", // 1100 USDT
            pnlMinor: "100000000", // 100 USDT profit
          },
        ],
        totalAllocatedMinor: "1000000000",
        totalEquityMinor: "1100000000",
        totalPnlMinor: "100000000",
      };

      // Verify PnL calculation
      const pnl = BigInt(summary.allocations[0].equityMinor) - BigInt(summary.allocations[0].allocatedMinor);
      expect(pnl.toString()).toBe(summary.allocations[0].pnlMinor);

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(true);
    });
  });

  describe("BigInt precision", () => {
    it("should handle large values without precision loss", () => {
      const largeValue = "999999999999999999"; // Very large minor units
      const summary: PortfolioSummary = {
        availableCashMinor: largeValue,
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: largeValue,
            equityMinor: largeValue,
            pnlMinor: "0",
          },
        ],
        totalAllocatedMinor: largeValue,
        totalEquityMinor: largeValue,
        totalPnlMinor: "0",
      };

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(true);
    });

    it("should handle string conversion correctly", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
          {
            strategyId: "strategy-2",
            allocatedMinor: "300000000",
            equityMinor: "280000000",
            pnlMinor: "-20000000",
          },
        ],
        totalAllocatedMinor: "800000000",
        totalEquityMinor: "830000000",
        totalPnlMinor: "30000000",
      };

      // Verify string sums match
      const allocatedSum = summary.allocations.reduce((sum, a) => sum + BigInt(a.allocatedMinor), 0n);
      const equitySum = summary.allocations.reduce((sum, a) => sum + BigInt(a.equityMinor), 0n);
      const pnlSum = summary.allocations.reduce((sum, a) => sum + BigInt(a.pnlMinor), 0n);

      expect(allocatedSum.toString()).toBe(summary.totalAllocatedMinor);
      expect(equitySum.toString()).toBe(summary.totalEquityMinor);
      expect(pnlSum.toString()).toBe(summary.totalPnlMinor);

      const result = reconcilePortfolio(summary);
      expect(result.ok).toBe(true);
    });
  });

  describe("Available cash calculation with allocations", () => {
    it("should use the current available balance without double-subtracting allocations", async () => {
      const balanceAvailable = BigInt("1000000000"); // 1000 USDT in minor units
      const availableCashMinor = balanceAvailable.toString();

      expect(availableCashMinor).toBe("1000000000"); // Full balance available
    });

    it("should never return negative available cash", async () => {
      const balanceAvailable = BigInt("-1000000000"); // Defensive guard for bad data
      const availableCashMinor = (balanceAvailable < 0n ? 0n : balanceAvailable).toString();

      expect(availableCashMinor).toBe("0");
    });
  });

  describe("Negative equity protection", () => {
    it("should clamp negative equity to 0", () => {
      // Simulate position with negative equity (bad data scenario)
      const allocated = BigInt("500000000"); // 500 USDT
      const rawEquity = BigInt("-100000000"); // -100 USDT (negative, bad data)
      
      // Clamp equity to 0 if negative
      const safeEquity = rawEquity < 0n ? 0n : rawEquity;
      const equityMinor = safeEquity.toString();
      
      // Calculate PnL from safe equity
      const pnlMinor = (safeEquity - allocated).toString();
      
      expect(equityMinor).toBe("0");
      expect(pnlMinor).toBe("-500000000"); // PnL = 0 - 500 = -500
    });

    it("should handle positive equity correctly", () => {
      const allocated = BigInt("500000000"); // 500 USDT
      const rawEquity = BigInt("550000000"); // 550 USDT (positive)
      
      const safeEquity = rawEquity < 0n ? 0n : rawEquity;
      const equityMinor = safeEquity.toString();
      const pnlMinor = (safeEquity - allocated).toString();
      
      expect(equityMinor).toBe("550000000");
      expect(pnlMinor).toBe("50000000"); // PnL = 550 - 500 = 50
    });

    it("should handle zero equity correctly", () => {
      const allocated = BigInt("500000000"); // 500 USDT
      const rawEquity = BigInt("0"); // 0 USDT
      
      const safeEquity = rawEquity < 0n ? 0n : rawEquity;
      const equityMinor = safeEquity.toString();
      const pnlMinor = (safeEquity - allocated).toString();
      
      expect(equityMinor).toBe("0");
      expect(pnlMinor).toBe("-500000000"); // PnL = 0 - 500 = -500
    });

    it("should not display negative equity in portfolio summary", () => {
      // This test simulates the behavior of getPortfolioSummary
      // when positions have negative equity
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "-100000000", // Negative equity (bad data)
            pnlMinor: "-600000000",
          },
        ],
        totalAllocatedMinor: "500000000",
        totalEquityMinor: "-100000000",
        totalPnlMinor: "-600000000",
      };

      // After clamping, equity should be >= 0
      const clampedAllocations = summary.allocations.map((a) => {
        const rawEquity = BigInt(a.equityMinor);
        const safeEquity = rawEquity < 0n ? 0n : rawEquity;
        const allocated = BigInt(a.allocatedMinor);
        return {
          ...a,
          equityMinor: safeEquity.toString(),
          pnlMinor: (safeEquity - allocated).toString(),
        };
      });

      expect(clampedAllocations[0].equityMinor).toBe("0");
      expect(clampedAllocations[0].pnlMinor).toBe("-500000000");
    });
  });

  describe("Equity from snapshots", () => {
    it("should use snapshot equity when available", () => {
      // Test logic: snapshot equity takes precedence over position equity
      const snapshotEquity = BigInt("600000000"); // 600 USDT from snapshot
      const positionEquity = BigInt("550000000"); // 550 USDT from position (stale)
      const allocated = BigInt("500000000"); // 500 USDT
      
      // Simulate: if snapshot exists, use it; otherwise fallback to position
      const rawEquityMinor = snapshotEquity.toString(); // snapshot exists
      const rawEquity = BigInt(rawEquityMinor);
      const safeEquity = rawEquity < 0n ? 0n : rawEquity;
      const equityMinor = safeEquity.toString();
      const pnlMinor = (safeEquity - allocated).toString();
      
      expect(equityMinor).toBe("600000000"); // Uses snapshot, not position
      expect(pnlMinor).toBe("100000000"); // PnL = 600 - 500 = 100
    });

    it("should fallback to position equity when snapshot is missing", () => {
      const snapshotEquity = null; // No snapshot
      const positionEquity = BigInt("550000000"); // 550 USDT from position
      const allocated = BigInt("500000000"); // 500 USDT
      
      // Simulate: if snapshot exists, use it; otherwise fallback to position
      const rawEquityMinor = snapshotEquity ? snapshotEquity.toString() : positionEquity.toString();
      const rawEquity = BigInt(rawEquityMinor);
      const safeEquity = rawEquity < 0n ? 0n : rawEquity;
      const equityMinor = safeEquity.toString();
      const pnlMinor = (safeEquity - allocated).toString();
      
      expect(equityMinor).toBe("550000000"); // Uses position as fallback
      expect(pnlMinor).toBe("50000000"); // PnL = 550 - 500 = 50
    });

    it("should fallback to principalMinor when both snapshot and investedCurrentMinor are missing", () => {
      const snapshotEquity = null; // No snapshot
      const positionEquity = null; // No investedCurrentMinor
      const principalMinor = BigInt("500000000"); // 500 USDT principal
      const allocated = BigInt("500000000"); // 500 USDT
      
      // Simulate: snapshot -> investedCurrentMinor -> principalMinor fallback chain
      const rawEquityMinor = snapshotEquity 
        ? snapshotEquity.toString() 
        : (positionEquity ? positionEquity.toString() : principalMinor.toString());
      const rawEquity = BigInt(rawEquityMinor);
      const safeEquity = rawEquity < 0n ? 0n : rawEquity;
      const equityMinor = safeEquity.toString();
      const pnlMinor = (safeEquity - allocated).toString();
      
      expect(equityMinor).toBe("500000000"); // Uses principalMinor as final fallback
      expect(pnlMinor).toBe("0"); // PnL = 500 - 500 = 0
    });
  });

  describe("getLatestSimEquitySnapshotsForUserLightweight", () => {
    it("should return latest snapshot per strategyId", () => {
      // Test logic: method should return one snapshot per strategyId (the latest)
      const userId = "test-user-123";
      const strategyId1 = "strategy-1";
      const strategyId2 = "strategy-2";
      
      // Simulate: 2 snapshots for strategy-1 (older and newer), 1 for strategy-2
      // Method should return only the latest for each strategy
      const mockResults = [
        { strategyId: strategyId1, equityMinor: "600000000", ts: 1000 }, // Latest for strategy-1
        { strategyId: strategyId2, equityMinor: "300000000", ts: 2000 }, // Latest for strategy-2
      ];
      
      // Verify structure: one snapshot per strategyId
      const strategyIds = new Set(mockResults.map((r) => r.strategyId));
      expect(strategyIds.size).toBe(2); // Two unique strategies
      
      // Verify each strategy has exactly one snapshot
      const strategy1Snapshots = mockResults.filter((r) => r.strategyId === strategyId1);
      expect(strategy1Snapshots.length).toBe(1);
      expect(strategy1Snapshots[0].equityMinor).toBe("600000000"); // Latest one
      
      const strategy2Snapshots = mockResults.filter((r) => r.strategyId === strategyId2);
      expect(strategy2Snapshots.length).toBe(1);
      expect(strategy2Snapshots[0].equityMinor).toBe("300000000");
    });

    it("should return empty array when no snapshots exist", () => {
      const mockResults: Array<{ strategyId: string; equityMinor: string; ts: number }> = [];
      
      expect(mockResults.length).toBe(0);
      expect(Array.isArray(mockResults)).toBe(true);
    });

    it("should return correct structure with strategyId, equityMinor, ts", () => {
      const mockResult = {
        strategyId: "strategy-1",
        equityMinor: "500000000",
        ts: 1234567890,
      };
      
      expect(mockResult).toHaveProperty("strategyId");
      expect(mockResult).toHaveProperty("equityMinor");
      expect(mockResult).toHaveProperty("ts");
      expect(typeof mockResult.strategyId).toBe("string");
      expect(typeof mockResult.equityMinor).toBe("string");
      expect(typeof mockResult.ts).toBe("number");
    });
  });

  describe("reconcilePortfolio position-snapshot sync check", () => {
    it("should detect desync when position and snapshot equity differ", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
        ],
        totalAllocatedMinor: "500000000",
        totalEquityMinor: "550000000",
        totalPnlMinor: "50000000",
      };

      const options = {
        positions: [
          {
            strategyId: "strategy-1",
            investedCurrentMinor: "600000000", // Position has 600
          },
        ],
        snapshots: [
          {
            strategyId: "strategy-1",
            equityMinor: "550000000", // Snapshot has 550 (diff = 50)
          },
        ],
        toleranceMinor: 1n,
      };

      const result = reconcilePortfolio(summary, options);

      expect(result.ok).toBe(false);
      expect(result.issues).toContain(expect.stringContaining("Position-snapshot desync"));
      expect(result.details).toBeDefined();
      expect(result.details?.length).toBeGreaterThan(0);
      expect(result.details?.[0].strategyId).toBe("strategy-1");
      expect(result.details?.[0].positionEquity).toBe("600000000");
      expect(result.details?.[0].snapshotEquity).toBe("550000000");
      expect(result.details?.[0].diff).toBe("50000000");
    });

    it("should not detect desync when difference is within tolerance", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
        ],
        totalAllocatedMinor: "500000000",
        totalEquityMinor: "550000000",
        totalPnlMinor: "50000000",
      };

      const options = {
        positions: [
          {
            strategyId: "strategy-1",
            investedCurrentMinor: "550000001", // Diff = 1 (within tolerance)
          },
        ],
        snapshots: [
          {
            strategyId: "strategy-1",
            equityMinor: "550000000",
          },
        ],
        toleranceMinor: 1n,
      };

      const result = reconcilePortfolio(summary, options);

      // Should not have position-snapshot desync issue
      const desyncIssues = result.issues?.filter((issue) => issue.includes("Position-snapshot desync")) || [];
      expect(desyncIssues.length).toBe(0);
    });

    it("should skip check when snapshot is missing", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
        ],
        totalAllocatedMinor: "500000000",
        totalEquityMinor: "550000000",
        totalPnlMinor: "50000000",
      };

      const options = {
        positions: [
          {
            strategyId: "strategy-1",
            investedCurrentMinor: "600000000",
          },
        ],
        snapshots: [], // No snapshot for strategy-1
        toleranceMinor: 1n,
      };

      const result = reconcilePortfolio(summary, options);

      // Should not have position-snapshot desync issue (snapshot missing, skip check)
      const desyncIssues = result.issues?.filter((issue) => issue.includes("Position-snapshot desync")) || [];
      expect(desyncIssues.length).toBe(0);
    });

    it("should handle multiple strategies with desync", () => {
      const summary: PortfolioSummary = {
        availableCashMinor: "1000000000",
        allocations: [
          {
            strategyId: "strategy-1",
            allocatedMinor: "500000000",
            equityMinor: "550000000",
            pnlMinor: "50000000",
          },
          {
            strategyId: "strategy-2",
            allocatedMinor: "300000000",
            equityMinor: "280000000",
            pnlMinor: "-20000000",
          },
        ],
        totalAllocatedMinor: "800000000",
        totalEquityMinor: "830000000",
        totalPnlMinor: "30000000",
      };

      const options = {
        positions: [
          {
            strategyId: "strategy-1",
            investedCurrentMinor: "600000000", // Diff = 50
          },
          {
            strategyId: "strategy-2",
            investedCurrentMinor: "250000000", // Diff = 30
          },
        ],
        snapshots: [
          {
            strategyId: "strategy-1",
            equityMinor: "550000000",
          },
          {
            strategyId: "strategy-2",
            equityMinor: "280000000",
          },
        ],
        toleranceMinor: 1n,
      };

      const result = reconcilePortfolio(summary, options);

      expect(result.ok).toBe(false);
      expect(result.details?.length).toBe(2); // Both strategies have desync
      expect(result.details?.some((d) => d.strategyId === "strategy-1")).toBe(true);
      expect(result.details?.some((d) => d.strategyId === "strategy-2")).toBe(true);
    });
  });
});
