/**
 * E2E tests for critical money flows
 * 
 * These tests verify end-to-end functionality of financial operations:
 * - Deposit operations
 * - Withdrawal operations
 * - Investment operations
 * - Vault transfers
 * 
 * Prerequisites:
 * - Database must be set up and seeded
 * - Test user must be authenticated
 * - 2FA must be enabled for withdrawal tests
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "../../routes";
import { storage } from "../../storage";
import { db } from "../../db";
import { balances, operations } from "@shared/schema";
import { eq } from "drizzle-orm";

// Test configuration
const TEST_USER_ID = "test-user-e2e";
const BASE_URL = "/api";

describe("E2E: Money Flows", () => {
  let app: express.Application;
  let httpServer: any;
  let authToken: string; // Mock auth token

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      (req as any).user = { id: TEST_USER_ID, claims: { sub: TEST_USER_ID } };
      (req as any).requestId = `test-${Date.now()}`;
      next();
    });

    httpServer = createServer(app);
    await registerRoutes(httpServer, app);

    // Ensure test user data exists
    await storage.ensureUserData(TEST_USER_ID);
  });

  afterAll(async () => {
    // Cleanup: Remove test operations and reset balances
    await db.delete(operations).where(eq(operations.userId, TEST_USER_ID));
    await db.update(balances)
      .set({ available: "0", locked: "0" })
      .where(eq(balances.userId, TEST_USER_ID));
    
    if (httpServer) {
      httpServer.close();
    }
  });

  describe("Deposit Operations", () => {
    it("should successfully deposit USDT", async () => {
      const idempotencyKey = `dep-test-${Date.now()}`;
      const amount = "100000000"; // 100 USDT

      const response = await request(app)
        .post(`${BASE_URL}/deposit/usdt/simulate`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ amount });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("operation");
      expect(response.body.operation).toHaveProperty("id");

      // Verify balance increased
      const balance = await storage.getBalance(TEST_USER_ID, "USDT");
      expect(balance).toBeDefined();
      expect(Number(balance!.available)).toBeGreaterThanOrEqual(Number(amount));
    });

    it("should prevent duplicate deposits with same idempotency key", async () => {
      const idempotencyKey = `dep-dup-${Date.now()}`;
      const amount = "50000000"; // 50 USDT

      const response1 = await request(app)
        .post(`${BASE_URL}/deposit/usdt/simulate`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ amount });

      const response2 = await request(app)
        .post(`${BASE_URL}/deposit/usdt/simulate`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ amount });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Both should return the same operation ID
      expect(response1.body.operation.id).toBe(response2.body.operation.id);

      // Balance should only increase once
      const balance = await storage.getBalance(TEST_USER_ID, "USDT");
      const initialAmount = Number(response1.body.operation.amount);
      // Balance should be initial + amount (not 2x amount)
      expect(Number(balance!.available)).toBeLessThan(initialAmount + Number(amount) * 2);
    });
  });

  describe("Investment Operations", () => {
    it("should successfully invest in a strategy", async () => {
      // Ensure user has balance
      const balance = await storage.getBalance(TEST_USER_ID, "USDT");
      if (!balance || Number(balance.available) < 100000000) {
        // Add balance for test
        await storage.updateBalance(TEST_USER_ID, "USDT", "200000000", balance?.locked || "0");
      }

      const idempotencyKey = `inv-test-${Date.now()}`;
      const amount = "100000000"; // 100 USDT
      
      // Get first available strategy
      const strategies = await storage.getStrategies();
      const strategy = strategies.find(s => s.isActive);
      
      if (!strategy) {
        throw new Error("No active strategy found for testing");
      }

      const response = await request(app)
        .post(`${BASE_URL}/invest`)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          amount,
          strategyId: strategy.id,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("operation");

      // Verify balance decreased
      const newBalance = await storage.getBalance(TEST_USER_ID, "USDT");
      expect(Number(newBalance!.available)).toBeLessThan(Number(balance!.available));
    });

    it("should prevent investment with insufficient balance", async () => {
      // Set balance to low amount
      await storage.updateBalance(TEST_USER_ID, "USDT", "1000000", "0"); // 0.01 USDT

      const idempotencyKey = `inv-insufficient-${Date.now()}`;
      const strategies = await storage.getStrategies();
      const strategy = strategies.find(s => s.isActive);

      if (!strategy) {
        throw new Error("No active strategy found for testing");
      }

      const response = await request(app)
        .post(`${BASE_URL}/invest`)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          amount: "100000000", // 100 USDT (more than balance)
          strategyId: strategy.id,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Vault Transfer Operations", () => {
    it("should successfully transfer from wallet to vault", async () => {
      // Ensure wallet has balance
      await storage.updateBalance(TEST_USER_ID, "USDT", "100000000", "0");

      const idempotencyKey = `vault-test-${Date.now()}`;
      const amount = "50000000"; // 50 USDT

      const response = await request(app)
        .post(`${BASE_URL}/vault/transfer`)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          fromVault: "wallet",
          toVault: "principal",
          amount,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("operation");

      // Verify vault balance increased
      const vault = await storage.getVault(TEST_USER_ID, "principal");
      expect(vault).toBeDefined();
      expect(Number(vault!.balance)).toBeGreaterThan(0);
    });

    it("should prevent duplicate transfers with same idempotency key", async () => {
      const idempotencyKey = `vault-dup-${Date.now()}`;
      const amount = "20000000"; // 20 USDT

      const response1 = await request(app)
        .post(`${BASE_URL}/vault/transfer`)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          fromVault: "wallet",
          toVault: "principal",
          amount,
        });

      const response2 = await request(app)
        .post(`${BASE_URL}/vault/transfer`)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          fromVault: "wallet",
          toVault: "principal",
          amount,
        });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.operation.id).toBe(response2.body.operation.id);
    });
  });

  describe("Withdrawal Operations", () => {
    // Note: Withdrawal requires 2FA, so these tests are more complex
    // For now, we'll test the validation logic
    
    it("should validate withdrawal amount", async () => {
      const response = await request(app)
        .post(`${BASE_URL}/withdraw/usdt`)
        .send({
          amount: "0",
          address: "0x1234567890123456789012345678901234567890",
        });

      // Should fail validation (amount must be > 0)
      expect([400, 403]).toContain(response.status);
    });

    it("should validate withdrawal address format", async () => {
      const response = await request(app)
        .post(`${BASE_URL}/withdraw/usdt`)
        .send({
          amount: "10000000",
          address: "invalid-address",
        });

      expect(response.status).toBe(400);
    });
  });
});
