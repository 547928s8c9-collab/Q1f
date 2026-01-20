#!/usr/bin/env tsx
/**
 * Smoke test script
 * Starts server, runs minimal API + UI checks, then stops
 * 
 * Usage: npm run smoke
 */

import { spawn, execSync } from "child_process";
import { createServer } from "http";
import express from "express";
import request from "supertest";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const TEST_USER_ID = "smoke-test-user";
const PORT = 5001; // Use different port to avoid conflicts

let httpServer: any;
let app: express.Application;

async function setupTestServer(): Promise<void> {
  app = express();
  app.use(express.json());
  
  // Mock authentication
  app.use((req, res, next) => {
    (req as any).user = { id: TEST_USER_ID, claims: { sub: TEST_USER_ID } };
    (req as any).requestId = `smoke-${Date.now()}`;
    next();
  });

  httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  
  return new Promise((resolve, reject) => {
    httpServer.listen(PORT, () => {
      console.log(`✓ Test server started on port ${PORT}`);
      resolve();
    });
    httpServer.on("error", reject);
  });
}

async function teardownTestServer(): Promise<void> {
  return new Promise((resolve) => {
    if (httpServer) {
      httpServer.close(() => {
        console.log("✓ Test server stopped");
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function runHealthCheck(): Promise<boolean> {
  try {
    const response = await request(app)
      .get("/api/health")
      .expect(200);

    if (response.body.status === "ok" && response.body.database === "connected") {
      console.log("✓ Health check passed");
      return true;
    }
    console.error("✗ Health check failed: invalid response");
    return false;
  } catch (error) {
    console.error("✗ Health check failed:", error);
    return false;
  }
}

async function runBootstrapCheck(): Promise<boolean> {
  try {
    await storage.ensureUserData(TEST_USER_ID);
    
    const response = await request(app)
      .get("/api/bootstrap")
      .expect(200);

    if (response.body.user && response.body.balances && response.body.vaults) {
      console.log("✓ Bootstrap check passed");
      return true;
    }
    console.error("✗ Bootstrap check failed: invalid response structure");
    return false;
  } catch (error) {
    console.error("✗ Bootstrap check failed:", error);
    return false;
  }
}

async function runStrategiesCheck(): Promise<boolean> {
  try {
    const response = await request(app)
      .get("/api/invest/strategies")
      .expect(200);

    if (response.body.ok && Array.isArray(response.body.data?.strategies)) {
      console.log(`✓ Strategies check passed (${response.body.data.strategies.length} strategies)`);
      return true;
    }
    console.error("✗ Strategies check failed: invalid response");
    return false;
  } catch (error) {
    console.error("✗ Strategies check failed:", error);
    return false;
  }
}

async function runInvestOverviewCheck(): Promise<boolean> {
  try {
    const strategies = await storage.getStrategies();
    if (strategies.length === 0) {
      console.log("⚠ No strategies available, skipping overview check");
      return true;
    }

    const strategyId = strategies[0].id;
    const response = await request(app)
      .get(`/api/invest/strategies/${strategyId}/overview`)
      .expect(200);

    if (response.body.ok && response.body.data?.strategy) {
      console.log("✓ Invest overview check passed");
      return true;
    }
    console.error("✗ Invest overview check failed: invalid response");
    return false;
  } catch (error) {
    console.error("✗ Invest overview check failed:", error);
    return false;
  }
}

async function runInvestCandlesCheck(): Promise<boolean> {
  try {
    const strategies = await storage.getStrategies();
    if (strategies.length === 0) {
      console.log("⚠ No strategies available, skipping candles check");
      return true;
    }

    const strategyId = strategies[0].id;
    const response = await request(app)
      .get(`/api/invest/strategies/${strategyId}/candles?periodDays=7`)
      .expect(200);

    if (response.body.ok && Array.isArray(response.body.data?.candles)) {
      const candles = response.body.data.candles;
      if (candles.length > 0) {
        const candle = candles[0];
        // Validate OHLC structure
        if (candle.ts && candle.open && candle.high && candle.low && candle.close) {
          console.log(`✓ Invest candles check passed (${candles.length} candles)`);
          return true;
        }
      } else {
        console.log("⚠ No candles returned, but structure is valid");
        return true;
      }
    }
    console.error("✗ Invest candles check failed: invalid response");
    return false;
  } catch (error) {
    console.error("✗ Invest candles check failed:", error);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("🚀 Starting smoke test...\n");

  let allPassed = true;

  try {
    // Setup
    await setupTestServer();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for server to be ready

    // Run checks
    const checks = [
      { name: "Health Check", fn: runHealthCheck },
      { name: "Bootstrap Check", fn: runBootstrapCheck },
      { name: "Strategies Check", fn: runStrategiesCheck },
      { name: "Invest Overview Check", fn: runInvestOverviewCheck },
      { name: "Invest Candles Check", fn: runInvestCandlesCheck },
    ];

    for (const check of checks) {
      console.log(`\nRunning ${check.name}...`);
      const passed = await check.fn();
      if (!passed) {
        allPassed = false;
      }
    }

    // Teardown
    await teardownTestServer();

    console.log("\n" + "=".repeat(50));
    if (allPassed) {
      console.log("✅ All smoke tests PASSED");
      process.exit(0);
    } else {
      console.log("❌ Some smoke tests FAILED");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ Smoke test error:", error);
    await teardownTestServer();
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main as runSmokeTest };
