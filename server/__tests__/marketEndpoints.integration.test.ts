import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describeWithDb } from "../test/utils/requireDb";
import { storage } from "../storage";

vi.mock("../replit_integrations/auth", () => {
  const user = { claims: { sub: "test-user" }, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  return {
    setupAuth: async (app: any) => {
      app.use((req: any, _res: any, next: any) => {
        req.user = user;
        req.isAuthenticated = () => true;
        next();
      });
    },
    registerAuthRoutes: () => {},
    isAuthenticated: (req: any, _res: any, next: any) => {
      req.user = user;
      req.isAuthenticated = () => true;
      next();
    },
    authStorage: {
      getUser: async (id: string) => ({
        id,
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        profileImageUrl: null,
      }),
      upsertUser: async (userData: any) => userData,
    },
  };
});

function waitForCandleEvent(url: string, timeoutMs: number = 5000): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const req = httpRequest(url, (res) => {
      res.setEncoding("utf8");
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk;
        let idx = buffer.indexOf("\n\n");
        while (idx !== -1) {
          const block = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          idx = buffer.indexOf("\n\n");
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.replace("data:", "").trim());
            if (payload.type === "candle") {
              resolved = true;
              cleanup();
              resolve(true);
              return;
            }
          } catch {
            // ignore parse errors
          }
        }
      });
      res.on("error", (err) => {
        if (!resolved) {
          cleanup();
          reject(err);
        }
      });
    });

    req.on("error", (err) => {
      if (!resolved) {
        cleanup();
        reject(err);
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("Timeout waiting for candle event"));
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      req.destroy();
    }

    req.end();
  });
}

describeWithDb("market endpoints integration", () => {
  let app: express.Express;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    app = express();
    server = createServer(app);
    const routes = await import("../routes");
    await routes.registerRoutes(server, app);
    await storage.seedStrategyProfiles();
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /api/market/candles returns 120 candles", async () => {
    const res = await request(app)
      .get("/api/market/candles")
      .query({ symbol: "BTCUSDT", timeframe: "15m", limit: "120" });
    expect(res.status).toBe(200);
    expect(res.body?.data?.candles).toHaveLength(120);
    expect(res.body?.data?.gaps || []).toHaveLength(0);
  });

  it("SSE stream emits candle events", async () => {
    const profiles = await storage.getStrategyProfiles();
    const profile = profiles[0];
    if (!profile) {
      throw new Error("No strategy profiles available for test");
    }

    const createRes = await request(app)
      .post("/api/live-sessions")
      .send({ strategyId: profile.slug });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.sessionId as string;
    expect(sessionId).toBeTruthy();

    const startRes = await request(app)
      .post(`/api/live-sessions/${sessionId}/start`)
      .send({});
    expect(startRes.status).toBe(200);

    const gotCandle = await waitForCandleEvent(
      `http://127.0.0.1:${port}/api/sim/sessions/${sessionId}/stream`
    );
    expect(gotCandle).toBe(true);

    await request(app)
      .post(`/api/live-sessions/${sessionId}/control`)
      .send({ action: "stop" });
  }, 15000);
});
