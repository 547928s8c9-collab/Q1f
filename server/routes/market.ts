import type { RouteDeps } from "./types";
import { liveTickerEngine } from "../services/liveTickerEngine";
import { logger } from "../lib/logger";

const MAX_SSE_CONNECTIONS = 50;
let activeConnections = 0;

export function registerMarketRoutes({ app }: RouteDeps): void {
  app.get("/api/market/stream", (req, res) => {
    if (activeConnections >= MAX_SSE_CONNECTIONS) {
      return res.status(503).json({ ok: false, error: { code: "TOO_MANY_CONNECTIONS", message: "Too many active SSE connections" } });
    }

    activeConnections++;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const snapshot = liveTickerEngine.getSnapshot();
    const initPayload = JSON.stringify({
      type: "init",
      quotes: snapshot.quotes,
      sparklines: snapshot.sparklines,
      trades: liveTickerEngine.getRecentTrades(20),
      ts: Date.now(),
    });
    res.write(`data: ${initPayload}\n\n`);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      unsubscribe();
      activeConnections--;
    };

    const unsubscribe = liveTickerEngine.subscribe((data) => {
      try {
        res.write(data);
      } catch (err) {
        logger.warn("SSE write failed, cleaning up", "market-routes", { error: String(err) });
        cleanup();
      }
    });

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch (err) {
        logger.warn("SSE heartbeat failed, cleaning up", "market-routes", { error: String(err) });
        cleanup();
      }
    }, 15000);

    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  });

  app.get("/api/market/quotes", (_req, res) => {
    try {
      const snapshot = liveTickerEngine.getSnapshot();
      res.json({ ok: true, data: snapshot });
    } catch (error) {
      logger.error("Market quotes error", "market-routes", {}, error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  app.get("/api/market/quotes/:symbol/sparkline", (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const sparkline = liveTickerEngine.getSparkline(symbol);
      if (sparkline.length === 0) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Symbol not found" } });
      }
      res.json({ ok: true, data: { symbol, sparkline } });
    } catch (error) {
      logger.error("Market sparkline error", "market-routes", {}, error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  app.get("/api/market/trades", (_req, res) => {
    try {
      const limit = Math.min(parseInt(String(_req.query.limit) || "20", 10), 50);
      const trades = liveTickerEngine.getRecentTrades(limit);
      res.json({ ok: true, data: { trades } });
    } catch (error) {
      logger.error("Market trades error", "market-routes", {}, error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // Proxy for Alpha Vantage — keeps API key server-side
  app.get("/api/market/spy-prices", async (req, res) => {
    try {
      const apiKey = process.env.ALPHA_VANTAGE_KEY || "demo";
      const days = parseInt(String(req.query.days) || "30", 10);
      const outputsize = days > 100 ? "full" : "compact";
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SPY&outputsize=${outputsize}&apikey=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ ok: false, error: { code: "UPSTREAM_ERROR", message: `Alpha Vantage returned ${response.status}` } });
      }
      const data = await response.json();
      res.json({ ok: true, data });
    } catch (error) {
      logger.error("SPY prices proxy error", "market-routes", {}, error);
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch SPY prices" } });
    }
  });
}
