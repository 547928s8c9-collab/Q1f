import { engineScheduler } from "./engineScheduler";
import { runTrader } from "./traderService";
import { storage } from "../storage";
import { getMarketCandles } from "./marketDataService";
import { logger } from "../lib/logger";
import type { StrategyConfig, StrategyProfileSlug } from "../strategies/types";

const ENGINE_TICK_INTERVAL_MS = 15_000;

export async function initializeEngineScheduler(): Promise<void> {
  engineScheduler.start();
}

export async function registerEngineLoop(userId: string, strategyId: string): Promise<void> {
  const strategy = await storage.getStrategy(strategyId);
  if (!strategy) {
    logger.warn("registerEngineLoop: strategy not found", "engine-init", { userId, strategyId });
    return;
  }

  const profiles = await storage.getStrategyProfiles();
  const profile = profiles.find((p) => p.displayName === strategy.name);
  if (!profile) {
    logger.warn("registerEngineLoop: no profile for strategy", "engine-init", { userId, strategyId, name: strategy.name });
    return;
  }

  const allocations = await storage.getActiveAllocationsForUser(userId);
  const alloc = allocations.find((a) => a.strategyId === strategyId);
  let allocatedMinor = alloc?.amountMinor || "0";

  if (allocatedMinor === "0" || BigInt(allocatedMinor) <= 0n) {
    const position = await storage.getPosition(userId, strategyId);
    allocatedMinor = position?.investedCurrentMinor || position?.principalMinor || "0";
  }

  if (allocatedMinor === "0" || BigInt(allocatedMinor) <= 0n) {
    logger.warn("registerEngineLoop: zero allocation, skipping", "engine-init", { userId, strategyId });
    return;
  }

  const profileSlug = profile.slug as StrategyProfileSlug;
  const config = profile.defaultConfig as StrategyConfig;
  const symbol = profile.symbol;
  const timeframe = profile.timeframe;
  const expectedReturnMinBps = strategy.expectedMonthlyRangeBpsMin ?? 0;
  const expectedReturnMaxBps = strategy.expectedMonthlyRangeBpsMax ?? 500;

  const tick = async () => {
    try {
      const now = Date.now();
      const periodMs = 2 * 60 * 60 * 1000;
      const fromTs = now - periodMs;

      const result = await getMarketCandles({
        exchange: "synthetic",
        symbol,
        timeframe,
        fromTs,
        toTs: now,
        userId,
        strategyId,
      });

      if (!result.candles || result.candles.length === 0) {
        logger.warn("registerEngineLoop tick: no candles", "engine-init", { userId, strategyId, symbol });
        return;
      }

      const currentAllocs = await storage.getActiveAllocationsForUser(userId);
      const currentAlloc = currentAllocs.find((a) => a.strategyId === strategyId);
      let currentAllocated = currentAlloc?.amountMinor || "0";
      if (currentAllocated === "0" || BigInt(currentAllocated) <= 0n) {
        const currentPos = await storage.getPosition(userId, strategyId);
        currentAllocated = currentPos?.investedCurrentMinor || currentPos?.principalMinor || allocatedMinor;
      }

      await runTrader({
        userId,
        strategyId,
        profileSlug,
        config,
        symbol,
        timeframe,
        candles: result.candles,
        expectedReturnMinBps,
        expectedReturnMaxBps,
        allocatedMinor: currentAllocated,
        liveMode: true,
      });
    } catch (err) {
      logger.error("Engine tick error", "engine-init", { userId, strategyId }, err);
    }
  };

  engineScheduler.registerLoop({
    userId,
    strategyId,
    intervalMs: ENGINE_TICK_INTERVAL_MS,
    tick,
  });

  engineScheduler.start();

  setTimeout(() => {
    engineScheduler.tickLoop(`${userId}:${strategyId}`).catch((err) => {
      logger.error("First tick error", "engine-init", { userId, strategyId }, err);
    });
  }, 500);
}

export async function registerEngineLoopsForUser(userId: string): Promise<void> {
  const allocations = await storage.getActiveAllocationsForUser(userId);

  if (allocations.length > 0) {
    for (const alloc of allocations) {
      await registerEngineLoop(userId, alloc.strategyId).catch((err) => {
        logger.error("Failed to register engine loop for allocation", "engine-init", { userId, strategyId: alloc.strategyId }, err);
      });
    }
    return;
  }

  const positions = await storage.getPositions(userId);
  if (positions.length > 0) {
    for (const pos of positions) {
      const allocMinor = pos.investedCurrentMinor || pos.principalMinor || "0";
      if (BigInt(allocMinor) > 0n) {
        try {
          await storage.createSimAllocation({
            userId,
            strategyId: pos.strategyId,
            amountMinor: allocMinor,
            status: "ACTIVE",
          });
        } catch {
        }

        await registerEngineLoop(userId, pos.strategyId).catch((err) => {
          logger.error("Failed to register engine loop for position", "engine-init", { userId, strategyId: pos.strategyId }, err);
        });
      }
    }
  }
}
