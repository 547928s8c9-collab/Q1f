import { storage } from "../storage";
import { db } from "../db";
import { simAllocations } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface StrategyAllocationSummary {
  strategyId: string;
  allocatedMinor: string;
  equityMinor: string;
  pnlMinor: string;
}

export interface PortfolioSummary {
  availableCashMinor: string;
  allocations: StrategyAllocationSummary[];
  totalAllocatedMinor: string;
  totalEquityMinor: string;
  totalPnlMinor: string;
}

function sumMinor(values: string[]): bigint {
  return values.reduce((sum, value) => sum + BigInt(value || "0"), 0n);
}

export function reconcilePortfolio(summary: PortfolioSummary): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const allocatedTotal = sumMinor(summary.allocations.map((a) => a.allocatedMinor));
  const equityTotal = sumMinor(summary.allocations.map((a) => a.equityMinor));
  const pnlTotal = sumMinor(summary.allocations.map((a) => a.pnlMinor));

  if (allocatedTotal < 0n || equityTotal < 0n) {
    issues.push("Negative totals detected");
  }

  if (allocatedTotal.toString() !== summary.totalAllocatedMinor) {
    issues.push("Allocated total mismatch");
  }

  if (equityTotal.toString() !== summary.totalEquityMinor) {
    issues.push("Equity total mismatch");
  }

  if (pnlTotal.toString() !== summary.totalPnlMinor) {
    issues.push("PnL total mismatch");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  const [balances, positions, activeAllocations] = await Promise.all([
    storage.getBalances(userId),
    storage.getPositions(userId),
    // Get sum of all ACTIVE allocations for this user
    db.select({
      total: sql<string>`COALESCE(SUM(CAST(${simAllocations.amountMinor} AS BIGINT)), 0)::text`,
    })
      .from(simAllocations)
      .where(and(
        eq(simAllocations.userId, userId),
        eq(simAllocations.status, "ACTIVE")
      )),
  ]);

  const usdtBalance = balances.find((b) => b.asset === "USDT");
  const balanceAvailable = BigInt(usdtBalance?.available ?? "0");
  const totalAllocated = BigInt(activeAllocations[0]?.total ?? "0");
  
  // availableCashMinor = max(0, balances.available - sumAllocations)
  const availableCashMinor = (balanceAvailable > totalAllocated 
    ? balanceAvailable - totalAllocated 
    : 0n).toString();

  const allocations: StrategyAllocationSummary[] = positions.map((position) => {
    const allocatedMinor = position.principalMinor || "0";
    const rawEquityMinor = position.investedCurrentMinor || "0";
    // Ensure both are valid BigInt strings
    const allocated = BigInt(allocatedMinor || "0");
    const rawEquity = BigInt(rawEquityMinor || "0");
    
    // Clamp equity to 0 if negative (protection against bad data)
    const safeEquity = rawEquity < 0n ? 0n : rawEquity;
    const equityMinor = safeEquity.toString();
    
    // Calculate PnL from safe equity
    const pnlMinor = (safeEquity - allocated).toString();
    
    return {
      strategyId: position.strategyId,
      allocatedMinor,
      equityMinor,
      pnlMinor,
    };
  });

  const totalAllocatedMinor = sumMinor(allocations.map((a) => a.allocatedMinor)).toString();
  const totalEquityMinor = sumMinor(allocations.map((a) => a.equityMinor)).toString();
  const totalPnlMinor = sumMinor(allocations.map((a) => a.pnlMinor)).toString();

  return {
    availableCashMinor,
    allocations,
    totalAllocatedMinor,
    totalEquityMinor,
    totalPnlMinor,
  };
}
