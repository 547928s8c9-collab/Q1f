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
}

function hashKey(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function withAdvisoryLock(lockKey: number, fn: () => Promise<void>): Promise<boolean> {
  const result = await db.execute(sql`SELECT pg_try_advisory_lock(${lockKey}) as locked`);
  const locked = Boolean((result as { rows?: Array<{ locked: boolean }> }).rows?.[0]?.locked);
  if (!locked) return false;
  try {
    await fn();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
  }
  return true;
}

class EngineScheduler {
  private loops = new Map<string, { config: EngineLoopConfig; timer: NodeJS.Timeout | null; lastTickTs: number | null; lastError: string | null; running: boolean }>();

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
    });
  }

  start(): void {
    for (const [key, loop] of this.loops.entries()) {
      if (loop.timer) continue;
      loop.timer = setInterval(() => {
        void this.tickLoop(key);
      }, loop.config.intervalMs);
    }
  }

  stop(): void {
    for (const loop of this.loops.values()) {
      if (loop.timer) {
        clearInterval(loop.timer);
        loop.timer = null;
      }
    }
  }

  async tickLoop(key: string): Promise<void> {
    const loop = this.loops.get(key);
    if (!loop || loop.running) return;
    loop.running = true;
    const lockKey = hashKey(key);

    try {
      const acquired = await withAdvisoryLock(lockKey, loop.config.tick);
      if (acquired) {
        loop.lastTickTs = Date.now();
        loop.lastError = null;
      }
    } catch (error) {
      loop.lastError = error instanceof Error ? error.message : "Unknown error";
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

    return {
      activeLoops: loops.length,
      loops,
    };
  }
}

export const engineScheduler = new EngineScheduler();
