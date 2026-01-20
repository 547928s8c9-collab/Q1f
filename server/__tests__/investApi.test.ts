/**
 * API tests for invest endpoints
 * Tests: /api/invest/strategies, /api/invest/strategies/:id/overview, 
 *        /api/invest/strategies/:id/candles, /api/invest/strategies/:id/invest
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../routes";

const TEST_USER_ID = "test-user-api";
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb("Invest API Endpoints", () => {
  let app: express.Application;
  let httpServer: any;
  let testStrategyId: string;
  let storage: (typeof import("../storage"))["storage"];

  beforeAll(async () => {
    ({ storage } = await import("../storage"));

    app = express();
    app.use(express.json());
    
    // Mock authentication
    app.use((req, res, next) => {
      (req as any).user = { id: TEST_USER_ID, claims: { sub: TEST_USER_ID } };
      (req as any).requestId = `test-${Date.now()}`;
      next();
    });

    httpServer = createServer(app);
    await registerRoutes(httpServer, app);

    // Ensure test user data
    await storage.ensureUserData(TEST_USER_ID);

    // Get or create a test strategy
    const allStrategies = await storage.getStrategies();
    testStrategyId = allStrategies[0]?.id || "";
    
    if (!testStrategyId) {
      // Create a test strategy if none exists
      const strategy = await storage.createStrategy({
        name: "Test Strategy",
        description: "Test",
        riskTier: "LOW",
        baseAsset: "USDT",
        minInvestment: "100000000",
        isActive: true,
      });
      testStrategyId = strategy.id;
    }
  });

  afterAll(async () => {
    // Cleanup
    if (httpServer) {
      httpServer.close();
    }
  });

  describe("GET /api/invest/strategies", () => {
    it("should return list of strategies", async () => {
      const response = await request(app)
        .get("/api/invest/strategies")
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("strategies");
      expect(Array.isArray(response.body.data.strategies)).toBe(true);
    });

    it("should return strategies with required fields", async () => {
      const response = await request(app)
        .get("/api/invest/strategies")
        .expect(200);

      const strategies = response.body.data.strategies;
      if (strategies.length > 0) {
        const strategy = strategies[0];
        expect(strategy).toHaveProperty("id");
        expect(strategy).toHaveProperty("name");
        expect(strategy).toHaveProperty("riskTier");
        expect(strategy).toHaveProperty("minInvestment");
      }
    });
  });

  describe("GET /api/invest/strategies/:id/overview", () => {
    it("should return 404 for non-existent strategy", async () => {
      const response = await request(app)
        .get("/api/invest/strategies/non-existent-id/overview")
        .expect(404);

      expect(response.body).toHaveProperty("ok", false);
      expect(response.body.error).toHaveProperty("code", "NOT_FOUND");
    });

    it("should return strategy overview for valid strategy", async () => {
      if (!testStrategyId) {
        return; // Skip if no strategy available
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/overview`)
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
      expect(response.body.data).toHaveProperty("strategy");
      expect(response.body.data).toHaveProperty("state");
      expect(response.body.data).toHaveProperty("equityMinor");
      expect(response.body.data).toHaveProperty("allocatedMinor");
    });
  });

  describe("GET /api/invest/strategies/:id/candles", () => {
    it("should return 404 for non-existent strategy", async () => {
      const response = await request(app)
        .get("/api/invest/strategies/non-existent-id/candles")
        .expect(404);

      expect(response.body).toHaveProperty("ok", false);
    });

    it("should return candles with default parameters", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/candles`)
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
      expect(response.body.data).toHaveProperty("candles");
      expect(response.body.data).toHaveProperty("symbol");
      expect(response.body.data).toHaveProperty("timeframe");
      expect(Array.isArray(response.body.data.candles)).toBe(true);
    });

    it("should accept periodDays parameter", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/candles?periodDays=7`)
        .expect(200);

      expect(response.body.data).toHaveProperty("periodDays", 7);
    });

    it("should accept timeframe parameter", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/candles?timeframe=15m`)
        .expect(200);

      expect(response.body.data.timeframe).toBe("15m");
    });

    it("should validate timeframe", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/candles?timeframe=invalid`)
        .expect(400);

      expect(response.body).toHaveProperty("ok", false);
    });

    it("should return candles with valid OHLC structure", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/candles?periodDays=7`)
        .expect(200);

      const candles = response.body.data.candles;
      if (candles.length > 0) {
        const candle = candles[0];
        expect(candle).toHaveProperty("ts");
        expect(candle).toHaveProperty("open");
        expect(candle).toHaveProperty("high");
        expect(candle).toHaveProperty("low");
        expect(candle).toHaveProperty("close");
        expect(candle).toHaveProperty("volume");
        
        // OHLC invariants
        expect(candle.high).toBeGreaterThanOrEqual(candle.low);
        expect(candle.high).toBeGreaterThanOrEqual(candle.open);
        expect(candle.high).toBeGreaterThanOrEqual(candle.close);
        expect(candle.low).toBeLessThanOrEqual(candle.open);
        expect(candle.low).toBeLessThanOrEqual(candle.close);
      }
    });

    it("should respect limit parameter", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/candles?periodDays=30&limit=50`)
        .expect(200);

      const candles = response.body.data.candles;
      expect(Array.isArray(candles)).toBe(true);
      expect(candles.length).toBeLessThanOrEqual(50);
    });
  });

  describe("POST /api/invest/strategies/:id/invest", () => {
    it("should return 404 for non-existent strategy", async () => {
      const response = await request(app)
        .post("/api/invest/strategies/non-existent-id/invest")
        .send({ amountMinor: "100000000" })
        .expect(404);

      expect(response.body).toHaveProperty("ok", false);
    });

    it("should validate amountMinor", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .send({ amountMinor: "invalid" })
        .expect(400);

      expect(response.body).toHaveProperty("ok", false);
    });

    it("should require amountMinor", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("ok", false);
    });

    it("should create allocation with valid request", async () => {
      if (!testStrategyId) {
        return;
      }

      // Ensure user has balance
      await storage.updateBalance(TEST_USER_ID, "USDT", "1000000000", "0");

      const response = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", `test-invest-${Date.now()}`)
        .send({ amountMinor: "100000000" })
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
      expect(response.body.data).toHaveProperty("allocationId");
      expect(response.body.data).toHaveProperty("status");
    });

    it("should be idempotent with same requestId", async () => {
      if (!testStrategyId) {
        return;
      }

      const requestId = `test-idempotent-${Date.now()}`;

      const response1 = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", requestId)
        .send({ amountMinor: "50000000", requestId })
        .expect(200);

      const response2 = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", requestId)
        .send({ amountMinor: "50000000", requestId })
        .expect(200);

      // Should return same allocation
      expect(response1.body.data.allocationId).toBe(response2.body.data.allocationId);
    });
  });

  describe("POST /api/invest/strategies/:id/withdraw", () => {
    it("should validate amountMinor", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .send({ amountMinor: "invalid" })
        .expect(400);

      expect(response.body).toHaveProperty("ok", false);
    });

    it("should return 404 if no active allocation", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .send({ amountMinor: "10000000" })
        .expect(404);

      expect(response.body).toHaveProperty("ok", false);
      expect(response.body.error).toHaveProperty("code", "NO_ACTIVE_ALLOCATION");
    });

    it("should withdraw and increase balance", async () => {
      if (!testStrategyId) {
        return;
      }

      // First, invest to create an allocation
      await storage.updateBalance(TEST_USER_ID, "USDT", "1000000000", "0");
      
      const investResponse = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", `test-invest-${Date.now()}`)
        .send({ amountMinor: "100000000" })
        .expect(200);

      expect(investResponse.body.ok).toBe(true);

      // Get balance before withdraw
      const balanceBefore = await storage.getBalance(TEST_USER_ID, "USDT");
      const availableBefore = BigInt(balanceBefore?.available || "0");

      // Withdraw
      const withdrawResponse = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .set("Idempotency-Key", `test-withdraw-${Date.now()}`)
        .send({ amountMinor: "50000000" })
        .expect(200);

      expect(withdrawResponse.body.ok).toBe(true);
      expect(withdrawResponse.body.data).toHaveProperty("allocationId");
      expect(withdrawResponse.body.data).toHaveProperty("status");

      // Check balance increased
      const balanceAfter = await storage.getBalance(TEST_USER_ID, "USDT");
      const availableAfter = BigInt(balanceAfter?.available || "0");
      expect(availableAfter).toBe(availableBefore + BigInt("50000000"));
    });

    it("should not allow withdrawing more than allocated", async () => {
      if (!testStrategyId) {
        return;
      }

      // First, invest to create an allocation
      await storage.updateBalance(TEST_USER_ID, "USDT", "1000000000", "0");
      
      await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", `test-invest-${Date.now()}`)
        .send({ amountMinor: "100000000" })
        .expect(200);

      // Try to withdraw more than allocated
      const response = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .set("Idempotency-Key", `test-withdraw-${Date.now()}`)
        .send({ amountMinor: "200000000" })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toHaveProperty("code", "INSUFFICIENT_ALLOCATION");
    });

    it("should close allocation when withdrawing all", async () => {
      if (!testStrategyId) {
        return;
      }

      // First, invest to create an allocation
      await storage.updateBalance(TEST_USER_ID, "USDT", "1000000000", "0");
      
      const investResponse = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", `test-invest-${Date.now()}`)
        .send({ amountMinor: "100000000" })
        .expect(200);

      // Withdraw all
      const withdrawResponse = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .set("Idempotency-Key", `test-withdraw-${Date.now()}`)
        .send({ amountMinor: "100000000" })
        .expect(200);

      expect(withdrawResponse.body.ok).toBe(true);
      expect(withdrawResponse.body.data.status).toBe("CLOSED");

      // State should be NOT_INVESTED
      const state = await storage.getInvestState(TEST_USER_ID, testStrategyId);
      expect(state?.state).toBe("NOT_INVESTED");
    });

    it("should be idempotent with same requestId", async () => {
      if (!testStrategyId) {
        return;
      }

      // First, invest to create an allocation
      await storage.updateBalance(TEST_USER_ID, "USDT", "1000000000", "0");
      
      await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/invest`)
        .set("Idempotency-Key", `test-invest-${Date.now()}`)
        .send({ amountMinor: "100000000" })
        .expect(200);

      const requestId = `test-withdraw-${Date.now()}`;

      const response1 = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .set("Idempotency-Key", requestId)
        .send({ amountMinor: "10000000", requestId })
        .expect(200);

      const response2 = await request(app)
        .post(`/api/invest/strategies/${testStrategyId}/withdraw`)
        .set("Idempotency-Key", requestId)
        .send({ amountMinor: "10000000", requestId })
        .expect(200);

      expect(response1.body.data.allocationId).toBe(response2.body.data.allocationId);
    });
  });

  describe("GET /api/invest/strategies/:id/trades", () => {
    it("should return 404 for non-existent strategy", async () => {
      const response = await request(app)
        .get("/api/invest/strategies/non-existent-id/trades")
        .expect(404);

      expect(response.body).toHaveProperty("ok", false);
      expect(response.body.error).toHaveProperty("code", "NOT_FOUND");
    });

    it("should return trades with default limit", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/trades`)
        .expect(200);

      expect(response.body).toHaveProperty("ok", true);
      expect(response.body.data).toHaveProperty("trades");
      expect(Array.isArray(response.body.data.trades)).toBe(true);
      expect(response.body.data.trades.length).toBeLessThanOrEqual(100); // Default limit
    });

    it("should respect limit parameter", async () => {
      if (!testStrategyId) {
        return;
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/trades?limit=50`)
        .expect(200);

      expect(response.body.data.trades.length).toBeLessThanOrEqual(50);
    });

    it("should cap limit at 1000", async () => {
      if (!testStrategyId) {
        return;
      }

      // Request with limit > 1000 should be capped
      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/trades?limit=5000`)
        .expect(200);

      // Should be capped at 1000
      expect(response.body.data.trades.length).toBeLessThanOrEqual(1000);
    });

    it("should return nextCursor when there are more trades", async () => {
      if (!testStrategyId) {
        return;
      }

      // Create some test trades
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        await storage.createSimTrade({
          userId: TEST_USER_ID,
          strategyId: testStrategyId,
          symbol: "BTC/USDT",
          side: "LONG",
          status: "CLOSED",
          entryTs: now - (5 - i) * 1000,
          exitTs: now - (5 - i) * 1000 + 100,
          entryPrice: "50000",
          exitPrice: "51000",
          qty: "0.1",
          grossPnlMinor: "100000",
          feesMinor: "0",
          netPnlMinor: "100000",
          holdBars: 1,
          reason: "test",
        });
      }

      const response = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/trades?limit=2`)
        .expect(200);

      expect(response.body.data.trades.length).toBeLessThanOrEqual(2);
      // If there are more than 2 trades, nextCursor should be present
      if (response.body.data.trades.length === 2) {
        expect(response.body.data).toHaveProperty("nextCursor");
        expect(typeof response.body.data.nextCursor).toBe("string");
      }
    });

    it("should support cursor pagination", async () => {
      if (!testStrategyId) {
        return;
      }

      // Get first page
      const response1 = await request(app)
        .get(`/api/invest/strategies/${testStrategyId}/trades?limit=2`)
        .expect(200);

      expect(response1.body.data.trades.length).toBeLessThanOrEqual(2);

      // If there's a nextCursor, use it for second page
      if (response1.body.data.nextCursor) {
        const response2 = await request(app)
          .get(`/api/invest/strategies/${testStrategyId}/trades?limit=2&cursor=${response1.body.data.nextCursor}`)
          .expect(200);

        expect(response2.body.data.trades.length).toBeLessThanOrEqual(2);
        // Trades should be different (no overlap)
        if (response1.body.data.trades.length > 0 && response2.body.data.trades.length > 0) {
          expect(response1.body.data.trades[0].id).not.toBe(response2.body.data.trades[0].id);
        }
      }
    });
  });
});
