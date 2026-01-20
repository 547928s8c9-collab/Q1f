import type { InvestStrategySummary } from "@shared/contracts/invest";
import type { Strategy } from "@shared/schema";
import { storage } from "../storage";

const DEFAULT_BENCHMARKS = ["BTC", "ETH"];

function toPairs(strategy: Strategy): string[] {
  const pairs = Array.isArray(strategy.pairsJson) ? strategy.pairsJson : [];
  if (pairs.length > 0) return pairs;
  if (strategy.name && strategy.baseAsset) {
    return [`${strategy.name.split(" ")[0]}/${strategy.baseAsset}`];
  }
  return [];
}

function buildSummary(strategy: Strategy): InvestStrategySummary {
  return {
    id: strategy.id,
    name: strategy.name,
    description: strategy.description ?? null,
    riskTier: strategy.riskTier,
    expectedReturnMinBps: strategy.expectedMonthlyRangeBpsMin ?? null,
    expectedReturnMaxBps: strategy.expectedMonthlyRangeBpsMax ?? null,
    pairs: toPairs(strategy),
    benchmarks: DEFAULT_BENCHMARKS,
    minInvestmentMinor: strategy.minInvestment,
    isActive: strategy.isActive ?? true,
  };
}

export async function listStrategies(): Promise<InvestStrategySummary[]> {
  const strategies = await storage.getStrategies();
  return strategies.map(buildSummary);
}

export async function getStrategyById(strategyId: string): Promise<InvestStrategySummary | null> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) return null;
  return buildSummary(strategy);
}
