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
  const [balances, positions] = await Promise.all([
    storage.getBalances(userId),
    storage.getPositions(userId),
  ]);

  const usdtBalance = balances.find((b) => b.asset === "USDT");
  const availableCashMinor = usdtBalance?.available ?? "0";

  const allocations: StrategyAllocationSummary[] = positions.map((position) => {
    const allocatedMinor = position.principalMinor || "0";
    const equityMinor = position.investedCurrentMinor || "0";
    const pnlMinor = (BigInt(equityMinor) - BigInt(allocatedMinor)).toString();
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
