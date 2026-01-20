import { storage } from "../storage";

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

export interface ReconcileOptions {
  positions?: Array<{ strategyId: string; investedCurrentMinor: string | null }>;
  snapshots?: Array<{ strategyId: string; equityMinor: string }>;
  toleranceMinor?: bigint; // Default: 1 minor unit
}

export function reconcilePortfolio(
  summary: PortfolioSummary,
  options?: ReconcileOptions
): { ok: true } | { ok: false; issues: string[]; details?: Array<{ strategyId: string; positionEquity: string; snapshotEquity: string; diff: string }> } {
  const issues: string[] = [];
  const details: Array<{ strategyId: string; positionEquity: string; snapshotEquity: string; diff: string }> = [];
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

  // Check position vs snapshot synchronization
  if (options?.positions && options?.snapshots) {
    const tolerance = options.toleranceMinor ?? 1n;
    const snapshotMap = new Map(options.snapshots.map((s) => [s.strategyId, s]));

    for (const position of options.positions) {
      const snapshot = snapshotMap.get(position.strategyId);
      if (!snapshot) {
        continue; // No snapshot to compare, skip
      }

      const positionEquity = BigInt(position.investedCurrentMinor || "0");
      const snapshotEquity = BigInt(snapshot.equityMinor || "0");
      const diff = positionEquity > snapshotEquity 
        ? positionEquity - snapshotEquity 
        : snapshotEquity - positionEquity;

      if (diff > tolerance) {
        issues.push(`Position-snapshot desync for strategy ${position.strategyId}: position=${positionEquity.toString()}, snapshot=${snapshotEquity.toString()}, diff=${diff.toString()}`);
        details.push({
          strategyId: position.strategyId,
          positionEquity: positionEquity.toString(),
          snapshotEquity: snapshotEquity.toString(),
          diff: diff.toString(),
        });
      }
    }
  }

  return issues.length === 0 
    ? { ok: true } 
    : { ok: false, issues, details: details.length > 0 ? details : undefined };
}

export async function getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  const [balances, positions] = await Promise.all([
    storage.getBalances(userId),
    storage.getPositions(userId),
  ]);

  const usdtBalance = balances.find((b) => b.asset === "USDT");
  const balanceAvailable = BigInt(usdtBalance?.available ?? "0");
  // balances.available already reflects invest/withdraw deductions
  const availableCashMinor = (balanceAvailable < 0n ? 0n : balanceAvailable).toString();

  // Batch fetch latest equity snapshots for all strategies (lightweight version)
  const equitySnapshotsArray = await storage.getLatestSimEquitySnapshotsForUserLightweight(userId);
  const equitySnapshots = new Map(equitySnapshotsArray.map((s) => [s.strategyId, s]));

  const allocations: StrategyAllocationSummary[] = positions.map((position) => {
    const allocatedMinor = position.principalMinor || "0";
    const allocated = BigInt(allocatedMinor || "0");
    
    // Get equity from latest snapshot, fallback to position.investedCurrentMinor or principalMinor
    const snapshot = equitySnapshots.get(position.strategyId);
    let rawEquityMinor: string;
    
    if (snapshot) {
      // Use snapshot equity (most accurate, updated after ticks)
      rawEquityMinor = snapshot.equityMinor || "0";
    } else {
      // Fallback to position.investedCurrentMinor, or principalMinor if that's also missing
      rawEquityMinor = position.investedCurrentMinor || position.principalMinor || "0";
    }
    
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
