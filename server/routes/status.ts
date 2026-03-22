import { db } from "../db";
import { sql } from "drizzle-orm";
import { engineScheduler } from "../app/engineScheduler";
import type { RouteDeps } from "./types";

const ENGINE_STALE_MS = 25 * 60 * 60 * 1000; // 25 hours

async function checkDatabase(): Promise<{ status: "operational" | "degraded"; message?: string }> {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 500)
      ),
    ]);
    return { status: "operational" };
  } catch (err) {
    console.warn("Database health check failed", err);
    return { status: "degraded", message: "Database response slow or unavailable" };
  }
}

function checkEngine(): { status: "operational" | "degraded" | "unknown"; lastRunAt?: string } {
  const lastRunAt = engineScheduler.getLastRunAt();
  if (!lastRunAt) {
    return { status: "unknown" };
  }
  const ageMs = Date.now() - lastRunAt.getTime();
  if (ageMs <= ENGINE_STALE_MS) {
    return { status: "operational", lastRunAt: lastRunAt.toISOString() };
  }
  return { status: "degraded", lastRunAt: lastRunAt.toISOString() };
}

async function getSystemStatus() {
  const overall = (process.env.SYSTEM_STATUS || "operational") as "operational" | "degraded" | "maintenance";
  const message = process.env.SYSTEM_STATUS_MESSAGE || null;

  const [dbStatus, engineStatus] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEngine()),
  ]);

  return {
    overall,
    message,
    components: {
      deposits:    { status: (process.env.STATUS_DEPOSITS    || "operational") as "operational" | "degraded" | "outage" },
      withdrawals: { status: (process.env.STATUS_WITHDRAWALS || "operational") as "operational" | "degraded" | "outage" },
      strategies:  { status: (process.env.STATUS_STRATEGIES  || "operational") as "operational" | "degraded" | "outage" },
      database: dbStatus,
      engine:   engineStatus,
    },
    timestamp: new Date().toISOString(),
  };
}

export function registerStatusRoutes({ app }: RouteDeps): void {
  // GET /api/status - System status endpoint (public)
  app.get("/api/status", (_req, res) => {
    void getSystemStatus().then((status) => res.json(status));
  });
}
