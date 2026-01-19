import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { errorHandler } from "./middleware/errorHandler";
import { normalizePath } from "./metrics/normalizePath";
import { initTwoFactorCrypto } from "./lib/twofactorCrypto";
import { startOutboxWorker } from "./workers/outboxWorker";

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

// Security headers via helmet
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting configuration
const strictPaths = ["/api/login", "/api/callback", "/api/metrics", "/api/market", "/api/strategies"];

const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  validate: { xForwardedForHeader: false },
  skip: (req) => strictPaths.some(p => req.path.startsWith(p.replace("/api", ""))),
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
  validate: { xForwardedForHeader: false },
});

const metricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many metrics requests" },
  validate: { xForwardedForHeader: false },
});

const marketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many market data requests, please slow down" },
  validate: { xForwardedForHeader: false },
});

// Apply strict limiters to specific routes first
app.use("/api/login", authLimiter);
app.use("/api/callback", authLimiter);
app.use("/api/metrics", metricsLimiter);
app.use("/api/market", marketLimiter);
app.use("/api/strategies", marketLimiter);

// General API limiter for remaining /api routes
app.use("/api", generalApiLimiter);

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

const METRICS_ENDPOINT_CAP = 500;

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

      // Prefer Express route pattern if available, otherwise normalize path
      const routePath = req.route?.path ? `${req.baseUrl}${req.route.path}` : normalizePath(path);
      let endpointKey = `${req.method} ${routePath}`;

      // Memory cap: aggregate to __other__ if too many unique keys
      const keyCount = Object.keys(metrics.requestsByEndpoint).length;
      if (keyCount >= METRICS_ENDPOINT_CAP && !(endpointKey in metrics.requestsByEndpoint)) {
        endpointKey = "__other__";
      }
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
  // Initialize 2FA encryption
  initTwoFactorCrypto();

  await registerRoutes(httpServer, app);

  if (process.env.TELEGRAM_NOTIFICATIONS_ENABLED === "true") {
    startOutboxWorker();
    log("Telegram outbox worker started", "outbox");
  }

  app.use(errorHandler);

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
