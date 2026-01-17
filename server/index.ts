import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import crypto from "crypto";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// Request ID middleware
app.use((req, _res, next) => {
  req.requestId = req.headers["x-request-id"] as string || crypto.randomUUID().slice(0, 8);
  next();
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Structured logging helper
export function log(message: string, source = "express", meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  if (meta) {
    console.log(`${formattedTime} [${source}] ${message}`, JSON.stringify(meta));
  } else {
    console.log(`${formattedTime} [${source}] ${message}`);
  }
}

// Metrics counters (simple in-memory)
const metrics = {
  requestCount: 0,
  requestsByStatus: {} as Record<string, number>,
  requestsByEndpoint: {} as Record<string, number>,
};

export function getMetrics() {
  return { ...metrics };
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  const requestId = req.requestId;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson as Record<string, unknown>;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Update metrics
      metrics.requestCount++;
      const statusKey = `${res.statusCode}`;
      metrics.requestsByStatus[statusKey] = (metrics.requestsByStatus[statusKey] || 0) + 1;
      const endpointKey = `${req.method} ${path.split("/").slice(0, 4).join("/")}`;
      metrics.requestsByEndpoint[endpointKey] = (metrics.requestsByEndpoint[endpointKey] || 0) + 1;

      // Structured log
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine, "express", { requestId, duration, status: res.statusCode });
    }
  });

  next();
});

// Metrics endpoint (admin only - check for secret header)
app.get("/api/metrics", (req, res) => {
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  const METRICS_SECRET = process.env.METRICS_SECRET;
  
  // In production, require metrics secret
  if (IS_PRODUCTION && !METRICS_SECRET) {
    return res.status(500).json({ error: "Service not configured" });
  }
  
  const expectedSecret = METRICS_SECRET || "demo-metrics-secret";
  const providedSecret = req.headers["x-metrics-secret"];
  
  if (providedSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  res.json(getMetrics());
});

(async () => {
  await registerRoutes(httpServer, app);

  const resetCount = await storage.resetRunningSessions();
  if (resetCount > 0) {
    log(`Reset ${resetCount} running simulation sessions to paused state`, "sim");
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
