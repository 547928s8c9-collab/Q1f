import { db } from "../db";
import { sql } from "drizzle-orm";

export interface EngineLoopConfig {
  userId: string;
  strategyId: string;
  intervalMs: number;
  tick: () => Promise<void>;
}

export interface EngineHealthReport {
  activeLoops: number;
  loops: Array<{
    key: string;
    userId: string;
    strategyId: string;
    intervalMs: number;
    lastTickTs: number | null;
    lastError: string | null;
    running: boolean;
  }>;
  metrics: {
    tickDurations: {
      p50: number | null;
      p95: number | null;
      p99: number | null;
      count: number;
    };
    lockStats: {
      totalAttempts: number;
      successful: number;
      failed: number;
      contentionRate: number;
    };
  };
}

function hashKey(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function withAdvisoryLock(
  lockKey: number,
  fn: () => Promise<void>,
  stats?: { totalAttempts: number; successful: number; failed: number }
): Promise<boolean> {
  if (stats) stats.totalAttempts++;
  const result = await db.execute(sql`SELECT pg_try_advisory_lock(${lockKey}) as locked`);
  const locked = Boolean((result as { rows?: Array<{ locked: boolean }> }).rows?.[0]?.locked);
  if (!locked) {
    if (stats) stats.failed++;
    return false;
  }
  if (stats) stats.successful++;
  try {
    await fn();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
  }
  return true;
}

class EngineScheduler {
  private loops = new Map<string, { config: EngineLoopConfig; timer: NodeJS.Timeout | null; lastTickTs: number | null; lastError: string | null; running: boolean; tickCount: number }>();
  private tickDurations: number[] = []; // Keep last 1000 durations for percentile calculation
  private lockStats = { totalAttempts: 0, successful: 0, failed: 0 };
  private readonly TICK_OK_THROTTLE = 30; // Log TICK_OK every 30 ticks

  registerLoop(config: EngineLoopConfig): void {
    const key = `${config.userId}:${config.strategyId}`;
    const existing = this.loops.get(key);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }
    this.loops.set(key, {
      config,
      timer: null,
      lastTickTs: existing?.lastTickTs ?? null,
      lastError: existing?.lastError ?? null,
      running: false,
      tickCount: existing?.tickCount ?? 0,
    });
  }

  start(): void {
    let startedCount = 0;
    for (const [key, loop] of this.loops.entries()) {
      if (loop.timer) continue;
      loop.timer = setInterval(() => {
        void this.tickLoop(key);
      }, loop.config.intervalMs);
      startedCount++;
    }
    
    if (startedCount > 0) {
      // Log startup (async import to avoid circular dependency)
      import("../lib/logger").then(({ logger }) => {
        logger.info("Engine scheduler started", "engine-scheduler", {
          activeLoops: this.loops.size,
          startedCount,
          tickIntervalMs: Array.from(this.loops.values())[0]?.config.intervalMs ?? 0,
        });
      }).catch(() => {
        // Ignore logging errors during startup
      });
    }
  }

  async stop(): Promise<void> {
    // Stop all timers first
    for (const loop of this.loops.values()) {
      if (loop.timer) {
        clearInterval(loop.timer);
        loop.timer = null;
      }
    }
    
    // Wait for in-flight ticks to complete (with timeout)
    const promises: Promise<void>[] = [];
    const runningLoops: Array<{ key: string; userId: string; strategyId: string }> = [];
    
    for (const [key, loop] of this.loops.entries()) {
      if (loop.running) {
        runningLoops.push({
          key,
          userId: loop.config.userId,
          strategyId: loop.config.strategyId,
        });
        
        // Wait for in-flight tick to complete (with timeout)
        promises.push(
          new Promise<void>((resolve) => {
            const startTime = Date.now();
            const check = setInterval(() => {
              if (!loop.running) {
                clearInterval(check);
                resolve();
              } else {
                // Check timeout
                const elapsed = Date.now() - startTime;
                if (elapsed >= 5000) {
                  clearInterval(check);
                  resolve();
                }
              }
            }, 100);
            
            // Safety timeout
            setTimeout(() => {
              clearInterval(check);
              resolve();
            }, 5000); // 5s timeout
          })
        );
      }
    }
    
    if (runningLoops.length > 0) {
      // Log which loops are still running
      const { logger } = await import("../lib/logger");
      logger.info("Waiting for in-flight engine ticks to complete", "engine-scheduler", {
        runningLoops: runningLoops.length,
        loops: runningLoops.map(l => `${l.userId}:${l.strategyId}`),
      });
    }
    
    await Promise.all(promises);
    
    // Clear all loops
    this.loops.clear();
  }

  async tickLoop(key: string): Promise<void> {
    const loop = this.loops.get(key);
    if (!loop || loop.running) return;
    loop.running = true;
    const lockKey = hashKey(key);
    const startTs = Date.now();
    const { userId, strategyId } = loop.config;

    try {
      const acquired = await withAdvisoryLock(lockKey, loop.config.tick, this.lockStats);
      const duration = Date.now() - startTs;
      
      // Track tick duration (keep last 1000)
      this.tickDurations.push(duration);
      if (this.tickDurations.length > 1000) {
        this.tickDurations.shift();
      }
      
      if (acquired) {
        loop.lastTickTs = Date.now();
        loop.lastError = null;
        loop.tickCount = (loop.tickCount || 0) + 1;

        // Log TICK_OK throttled (every N ticks)
        if (loop.tickCount % this.TICK_OK_THROTTLE === 0) {
          // Async log to avoid blocking
          import("../storage").then(({ storage }) => {
            storage.createEngineEvent({
              userId,
              strategyId,
              type: "TICK_OK",
              severity: "info",
              message: `Engine tick completed (${loop.tickCount} ticks)`,
              payloadJson: { duration, tickCount: loop.tickCount },
            }).catch(() => {
              // Ignore logging errors
            });
          }).catch(() => {
            // Ignore import errors
          });
        }
      }
    } catch (error) {
      const duration = Date.now() - startTs;
      this.tickDurations.push(duration);
      if (this.tickDurations.length > 1000) {
        this.tickDurations.shift();
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      loop.lastError = errorMessage;

      // Always log TICK_FAIL
      import("../storage").then(({ storage }) => {
        storage.createEngineEvent({
          userId,
          strategyId,
          type: "TICK_FAIL",
          severity: "error",
          message: `Engine tick failed: ${errorMessage}`,
          payloadJson: { duration, error: errorMessage },
        }).catch(() => {
          // Ignore logging errors
        });
      }).catch(() => {
        // Ignore import errors
      });
    } finally {
      loop.running = false;
    }
  }

  getHealth(): EngineHealthReport {
    const loops = Array.from(this.loops.entries()).map(([key, loop]) => ({
      key,
      userId: loop.config.userId,
      strategyId: loop.config.strategyId,
      intervalMs: loop.config.intervalMs,
      lastTickTs: loop.lastTickTs,
      lastError: loop.lastError,
      running: loop.running,
    }));

    // Calculate percentiles for tick durations
    const sortedDurations = [...this.tickDurations].sort((a, b) => a - b);
    const calculatePercentile = (p: number): number | null => {
      if (sortedDurations.length === 0) return null;
      const index = Math.floor(sortedDurations.length * p);
      return sortedDurations[Math.min(index, sortedDurations.length - 1)];
    };

    const contentionRate = this.lockStats.totalAttempts > 0
      ? this.lockStats.failed / this.lockStats.totalAttempts
      : 0;

    return {
      activeLoops: loops.length,
      loops,
      metrics: {
        tickDurations: {
          p50: calculatePercentile(0.5),
          p95: calculatePercentile(0.95),
          p99: calculatePercentile(0.99),
          count: sortedDurations.length,
        },
        lockStats: {
          totalAttempts: this.lockStats.totalAttempts,
          successful: this.lockStats.successful,
          failed: this.lockStats.failed,
          contentionRate: Math.round(contentionRate * 10000) / 100, // Percentage with 2 decimals
        },
      },
    };
  }
}

export const engineScheduler = new EngineScheduler();
