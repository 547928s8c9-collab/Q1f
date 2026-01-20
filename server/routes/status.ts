import type { RouteDeps } from "./types";

function getSystemStatus() {
  const overall = (process.env.SYSTEM_STATUS || "operational") as "operational" | "degraded" | "maintenance";
  const message = process.env.SYSTEM_STATUS_MESSAGE || null;

  return {
    overall,
    message,
    components: {
      deposits: {
        status: (process.env.STATUS_DEPOSITS || "operational") as "operational" | "degraded" | "outage",
      },
      withdrawals: {
        status: (process.env.STATUS_WITHDRAWALS || "operational") as "operational" | "degraded" | "outage",
      },
      strategies: {
        status: (process.env.STATUS_STRATEGIES || "operational") as "operational" | "degraded" | "outage",
      },
      api: {
        status: (process.env.STATUS_API || "operational") as "operational" | "degraded" | "outage",
      },
    },
    timestamp: new Date().toISOString(),
  };
}

export function registerStatusRoutes({ app }: RouteDeps): void {
  // GET /api/status - System status endpoint (public)
  app.get("/api/status", (_req, res) => {
    const status = getSystemStatus();
    res.json(status);
  });
}
