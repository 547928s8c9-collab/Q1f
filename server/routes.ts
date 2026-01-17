import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { randomUUID } from "crypto";
import { formatMoney, type StrategyPerformance, VALID_TIMEFRAMES, type Timeframe, SimSessionStatus, type StrategyProfileConfig } from "@shared/schema";
import { loadCandles, alignToGrid } from "./marketData/loadCandles";
import { normalizeSymbol, normalizeTimeframe, timeframeToMs } from "./marketData/utils";
import { marketSimService } from "./market/marketSimService";
import { ensureReplayClock, getDecisionNow, getSimLagMs, getSimNow, isSimEnabled } from "./market/replayClock";
import { sessionRunner } from "./sim/runner";
import { verifySumsubSignature } from "./security/sumsub";
import rateLimit from "express-rate-limit";

import { db, withTransaction, type DbTransaction } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { balances, vaults, positions, operations, auditLogs } from "@shared/schema";

// Invariant check: no negative balance
function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`INVARIANT_VIOLATION: ${label} cannot be negative (got ${value})`);
  }
}
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import { adminRouter } from "./admin/router";
import { adminAuthRouter } from "./admin/authRouter";
import { adminAuth } from "./admin/middleware/adminAuth";
import { loadPermissions } from "./admin/middleware/rbac";
import { ensureRequestId } from "./admin/middleware/requestId";

// Production guard for dev/test endpoints
const isProduction = process.env.NODE_ENV === "production";
const allowDemoEndpoints = process.env.ALLOW_DEMO_ENDPOINTS === "true";
function devOnlyGuard(_req: Request, res: Response, next: NextFunction) {
  if (isProduction || !allowDemoEndpoints) {
    return res.status(403).json({ error: "Not allowed" });
  }
  next();
}

// Configurable financial parameters (env-driven with sensible defaults)
const DEPOSIT_ADDRESS = process.env.DEPOSIT_ADDRESS || "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";
const NETWORK_FEE_MINOR = process.env.NETWORK_FEE_MINOR || "1000000"; // 1 USDT
const MIN_WITHDRAWAL_MINOR = process.env.MIN_WITHDRAWAL_MINOR || "10000000"; // 10 USDT
const MIN_DEPOSIT_MINOR = process.env.MIN_DEPOSIT_MINOR || "10000000"; // 10 USDT
const DEFAULT_RUB_RATE = parseFloat(process.env.DEFAULT_RUB_RATE || "92.5");

// Consent constants (canonical source)
const CURRENT_CONSENT_VERSION = "1.0";
const CURRENT_DOC_HASH = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// ==================== SHARED SERVICE FUNCTIONS ====================
// These ensure onboarding routes behave identically to canonical routes

interface AcceptConsentParams {
  userId: string;
  ip: string;
  userAgent: string;
}

interface AcceptConsentResult {
  success: true;
  alreadyAccepted: boolean;
  consentId: string;
  acceptedAt: string | undefined;
}

/**
 * Canonical consent acceptance logic.
 * Creates consent record, audit log, and updates security settings.
 * Used by both /api/consent/accept and /api/onboarding/accept-consent.
 */
async function acceptConsentCanonical(params: AcceptConsentParams): Promise<AcceptConsentResult> {
  const { userId, ip, userAgent } = params;

  // Check if user already accepted current version (idempotent)
  const latestConsent = await storage.getLatestConsent(userId, "combined");
  if (latestConsent?.version === CURRENT_CONSENT_VERSION) {
    return {
      success: true,
      alreadyAccepted: true,
      consentId: latestConsent.id,
      acceptedAt: latestConsent.acceptedAt?.toISOString(),
    };
  }

  // Create new consent record
  const consent = await storage.createConsent({
    userId,
    version: CURRENT_CONSENT_VERSION,
    documentType: "combined",
    docHash: CURRENT_DOC_HASH,
    acceptedAt: new Date(),
    ip,
    userAgent,
  });

  // Create audit log
  await storage.createAuditLog({
    userId,
    event: "CONSENT_ACCEPTED",
    resourceType: "consent",
    resourceId: consent.id,
    details: {
      version: CURRENT_CONSENT_VERSION,
      docHash: CURRENT_DOC_HASH,
    },
    ip,
    userAgent,
  });

  // Update security settings
  await storage.updateSecuritySettings(userId, { consentAccepted: true });

  return {
    success: true,
    alreadyAccepted: false,
    consentId: consent.id,
    acceptedAt: consent.acceptedAt?.toISOString(),
  };
}

interface StartKycParams {
  userId: string;
  ip: string;
  userAgent: string;
}

interface StartKycResult {
  success: true;
  status: string;
  message?: string;
  error?: { code: string; message: string; currentStatus?: string; allowedTransitions?: string[] };
}

/**
 * Canonical KYC start logic.
 * Validates state transition, creates/updates applicant, audit log, notification.
 * Used by both /api/kyc/start and /api/onboarding/start-kyc.
 */
async function startKycCanonical(params: StartKycParams): Promise<StartKycResult & { httpStatus: number }> {
  const { userId, ip, userAgent } = params;
  const { KycTransitions, KycStatus } = await import("@shared/schema");

  // Check if applicant exists
  let applicant = await storage.getKycApplicant(userId);
  const previousStatus = applicant?.status || "NOT_STARTED";

  // Validate transition
  const allowedTransitions = KycTransitions[previousStatus as keyof typeof KycTransitions] || [];
  if (!allowedTransitions.includes("IN_REVIEW")) {
    return {
      httpStatus: 400,
      success: true,
      status: previousStatus,
      error: {
        code: "INVALID_KYC_TRANSITION",
        message: "Invalid transition",
        currentStatus: previousStatus,
        allowedTransitions,
      },
    };
  }

  // Create or update applicant to IN_REVIEW
  if (!applicant) {
    applicant = await storage.createKycApplicant({
      userId,
      status: "IN_REVIEW",
      level: "basic",
      submittedAt: new Date(),
    });
  } else {
    applicant = await storage.updateKycApplicant(userId, {
      status: "IN_REVIEW",
      submittedAt: new Date(),
      rejectionReason: null,
      needsActionReason: null,
    });
  }

  // Log audit event
  await storage.createAuditLog({
    userId,
    event: "KYC_STATUS_CHANGED",
    resourceType: "kyc",
    resourceId: applicant?.id,
    details: { previousStatus, newStatus: "IN_REVIEW" },
    ip,
    userAgent,
  });

  // Create notification
  await storage.createNotification({
    userId,
    type: "kyc",
    title: "KYC Verification Started",
    message: "Your identity verification is now being reviewed.",
    resourceType: "kyc",
    resourceId: applicant?.id,
  });

  // Demo mode: auto-approve after 2 seconds (disabled in production)
  if (!isProduction) {
    setTimeout(async () => {
      try {
        const currentApplicant = await storage.getKycApplicant(userId);
        if (currentApplicant?.status === "IN_REVIEW") {
          await storage.updateKycApplicant(userId, {
            status: "APPROVED",
            reviewedAt: new Date(),
          });
          await storage.updateSecuritySettings(userId, { kycStatus: "approved" });

          // Log audit event
          await storage.createAuditLog({
            userId,
            event: "KYC_STATUS_CHANGED",
            resourceType: "kyc",
            resourceId: currentApplicant.id,
            details: { previousStatus: "IN_REVIEW", newStatus: "APPROVED" },
            ip: "system",
            userAgent: "demo-auto-approve",
          });

          // Create notification
          await storage.createNotification({
            userId,
            type: "kyc",
            title: "KYC Approved",
            message: "Your identity has been successfully verified.",
            resourceType: "kyc",
            resourceId: currentApplicant.id,
          });

          // Create operation record
          await storage.createOperation({
            userId,
            type: "KYC",
            status: "completed",
            asset: null,
            amount: null,
            fee: null,
            txHash: null,
            providerRef: null,
            strategyId: null,
            strategyName: null,
            fromVault: null,
            toVault: null,
            metadata: null,
            reason: null,
          });
        }
      } catch (err) {
        console.error("Demo KYC auto-approve error:", err);
      }
    }, 2000);
  }

  return {
    httpStatus: 200,
    success: true,
    status: "IN_REVIEW",
    message: isProduction
      ? "KYC verification started."
      : "KYC verification started. Demo mode will auto-approve in ~2 seconds.",
  };
}

// Helper to get userId from authenticated request
function getUserId(req: Request): string {
  return (req.user as any)?.claims?.sub;
}

// Idempotency helper for money endpoints (atomic approach)
// Inserts a "pending" row first to claim the key, preventing race conditions
// Returns { acquired: true, keyId } if we claimed the key, or { acquired: false, response } if duplicate
async function acquireIdempotencyLock(
  req: Request,
  userId: string,
  endpoint: string
): Promise<
  | { acquired: true; keyId: string }
  | { acquired: false; cached: true; status: number; body: any }
  | { acquired: false; cached: false }
> {
  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return { acquired: false, cached: false };
  }

  try {
    // Try to insert a pending row (responseStatus = null means in-progress)
    const created = await storage.createIdempotencyKey({
      userId,
      idempotencyKey,
      endpoint,
      operationId: null,
      responseStatus: null,
      responseBody: null,
    });
    return { acquired: true, keyId: created.id };
  } catch (err: any) {
    // Unique constraint violation = key already exists
    if (err.code === "23505") {
      // Check if the existing key has a completed response
      const existing = await storage.getIdempotencyKey(userId, idempotencyKey, endpoint);
      if (existing && existing.responseStatus !== null) {
        return {
          acquired: false,
          cached: true,
          status: existing.responseStatus,
          body: existing.responseBody,
        };
      }
      // Key exists but no response yet (concurrent request in progress)
      // Return 409 Conflict to indicate retry later
      return {
        acquired: false,
        cached: true,
        status: 409,
        body: { error: "Request in progress", code: "IDEMPOTENCY_CONFLICT" },
      };
    }
    throw err;
  }
}

// Complete idempotency after successful operation
async function completeIdempotency(
  keyId: string,
  operationId: string | null,
  status: number,
  body: any
): Promise<void> {
  await storage.updateIdempotencyKey(keyId, {
    operationId,
    responseStatus: status,
    responseBody: body,
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Setup authentication first
  await setupAuth(app);
  registerAuthRoutes(app);

  if (isSimEnabled()) {
    try {
      await marketSimService.ensureStarted();
    } catch (error) {
      console.error("Failed to start market sim service:", error);
    }
  }

  // Mount Admin API router
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", ensureRequestId, adminAuth, loadPermissions, adminRouter);

  // GET /api/health - Health check endpoint (public)
  app.get("/api/health", async (_req, res) => {
    try {
      // DB Ping
      await db.execute(sql`SELECT 1`);
      
      res.json({ 
        status: "ok", 
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(503).json({ 
        status: "error", 
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/bootstrap - Main bootstrap endpoint (protected)
  app.get("/api/bootstrap", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Get user from auth storage
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ensure user data is initialized
      await storage.ensureUserData(userId);

      // Parallel fetch all independent data
      const [
        balances,
        vaults,
        positions,
        portfolioSeries,
        security,
        latestConsent,
        kycApplicant,
        btcQuotes,
        ethQuotes,
        rubQuotes,
        whitelistAddresses,
      ] = await Promise.all([
        storage.getBalances(userId),
        storage.getVaults(userId),
        storage.getPositions(userId),
        storage.getPortfolioSeries(userId, 90),
        storage.getSecuritySettings(userId),
        storage.getLatestConsent(userId, "combined"),
        storage.getKycApplicant(userId),
        storage.getQuotes("BTC/USDT", 90),
        storage.getQuotes("ETH/USDT", 90),
        storage.getQuotes("USDT/RUB", 90),
        storage.getWhitelistAddresses(userId),
      ]);

      // Consent version (should match the constants in consent routes)
      const REQUIRED_CONSENT_VERSION = "1.0";
      const hasAcceptedConsent = !!latestConsent;
      const needsReaccept = latestConsent ? latestConsent.version !== REQUIRED_CONSENT_VERSION : false;

      // KYC status from kycApplicants table (single source of truth)
      const kycApplicantStatus = kycApplicant?.status || "NOT_STARTED";
      const isKycApproved = kycApplicantStatus === "APPROVED";

      // Calculate invested amounts
      const invested = positions.reduce(
        (acc, p) => ({
          current: (BigInt(acc.current) + BigInt(p.currentValue)).toString(),
          principal: (BigInt(acc.principal) + BigInt(p.principal)).toString(),
        }),
        { current: "0", principal: "0" }
      );

      const latestBtc = btcQuotes[btcQuotes.length - 1];
      const latestEth = ethQuotes[ethQuotes.length - 1];
      const latestRub = rubQuotes[rubQuotes.length - 1];

      // Build onboarding stage
      const contactVerified = security?.contactVerified ?? false;
      const consentAccepted = security?.consentAccepted ?? false;
      
      type OnboardingStage = "welcome" | "verify" | "consent" | "kyc" | "done";
      let onboardingStage: OnboardingStage = "welcome";
      if (!contactVerified) {
        onboardingStage = "verify";
      } else if (!consentAccepted) {
        onboardingStage = "consent";
      } else if (!isKycApproved) {
        onboardingStage = "kyc";
      } else {
        onboardingStage = "done";
      }

      // Build gate flags
      const consentRequired = !consentAccepted;
      const kycRequired = !isKycApproved;
      const twoFactorRequired = !security?.twoFactorEnabled;
      
      // Check whitelist requirement (whitelistAddresses already fetched in parallel)
      const hasActiveWhitelistAddress = whitelistAddresses.some((a) => a.status === "active");
      const whitelistRequired = security?.whitelistEnabled && !hasActiveWhitelistAddress;

      const reasons: string[] = [];
      if (!contactVerified) reasons.push("Verify your contact information");
      if (consentRequired) reasons.push("Please accept the terms and conditions");
      if (kycRequired) reasons.push("Complete identity verification");
      if (twoFactorRequired) reasons.push("Enable two-factor authentication");
      if (whitelistRequired) reasons.push("Add at least one active whitelist address");

      const usdtBalance = balances.find((b) => b.asset === "USDT");
      const rubBalance = balances.find((b) => b.asset === "RUB");

      // Build vault data with goals
      const buildVaultData = (vault: typeof vaults[0] | undefined) => {
        const balance = vault?.balance || "0";
        const goalAmount = vault?.goalAmount || null;
        let progress = 0;
        try {
          if (goalAmount && /^\d+$/.test(goalAmount)) {
            const balanceBig = BigInt(balance);
            const goalBig = BigInt(goalAmount);
            if (goalBig > 0n) {
              progress = Math.min(100, Number((balanceBig * 100n) / goalBig));
            }
          }
        } catch {
          progress = 0;
        }
        return {
          balance,
          goalName: vault?.goalName || null,
          goalAmount,
          autoSweepPct: vault?.autoSweepPct ?? 0,
          autoSweepEnabled: vault?.autoSweepEnabled ?? false,
          progress,
        };
      };
      
      const vaultMap = vaults.reduce((acc, v) => {
        acc[v.type] = v;
        return acc;
      }, {} as Record<string, typeof vaults[0]>);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        },
        onboarding: {
          stage: onboardingStage,
          contactVerified,
          consentAccepted,
          kycStatus: kycApplicantStatus,
        },
        consent: {
          hasAccepted: hasAcceptedConsent,
          currentVersion: latestConsent?.version || null,
          requiredVersion: REQUIRED_CONSENT_VERSION,
          needsReaccept,
          lastAcceptedAt: latestConsent?.acceptedAt?.toISOString() || null,
        },
        gate: {
          consentRequired,
          kycRequired,
          canDeposit: onboardingStage === "done",
          canInvest: onboardingStage === "done",
          canWithdraw: onboardingStage === "done" && !twoFactorRequired && !whitelistRequired,
          reasons,
        },
        balances: {
          USDT: { available: usdtBalance?.available || "0", locked: usdtBalance?.locked || "0" },
          RUB: { available: rubBalance?.available || "0", locked: rubBalance?.locked || "0" },
        },
        invested,
        vaults: {
          principal: buildVaultData(vaultMap.principal),
          profit: buildVaultData(vaultMap.profit),
          taxes: buildVaultData(vaultMap.taxes),
        },
        portfolioSeries: portfolioSeries.map((s) => ({ date: s.date, value: s.value })),
        quotes: {
          "BTC/USDT": {
            price: latestBtc?.price || "67500",
            change24h: latestBtc?.change24h || "0",
            series: btcQuotes.map((q) => ({ date: q.date, price: q.price })),
          },
          "ETH/USDT": {
            price: latestEth?.price || "3450",
            change24h: latestEth?.change24h || "0",
            series: ethQuotes.map((q) => ({ date: q.date, price: q.price })),
          },
          "USDT/RUB": {
            price: latestRub?.price || DEFAULT_RUB_RATE.toString(),
            change24h: latestRub?.change24h || "0",
            series: rubQuotes.map((q) => ({ date: q.date, price: q.price })),
          },
        },
        security: security || {
          consentAccepted: false,
          kycStatus: "pending",
          twoFactorEnabled: false,
          antiPhishingCode: null,
          whitelistEnabled: false,
          addressDelay: 0,
          autoSweepEnabled: false,
        },
        config: {
          depositAddress: DEPOSIT_ADDRESS,
          networkFee: NETWORK_FEE_MINOR,
          minWithdrawal: MIN_WITHDRAWAL_MINOR,
          minDeposit: MIN_DEPOSIT_MINOR,
        },
      });
    } catch (error) {
      console.error("Bootstrap error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies
  app.get("/api/strategies", async (req, res) => {
    try {
      const strategies = await storage.getStrategies();
      res.json(strategies);
    } catch (error) {
      console.error("Get strategies error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/performance-all - Get performance data for all strategies (for sparklines)
  // NOTE: Must be defined BEFORE /api/strategies/:id to avoid route conflict
  app.get("/api/strategies/performance-all", async (req, res) => {
    try {
      const strategies = await storage.getStrategies();
      
      // Parallel fetch performance for all strategies
      const perfList = await Promise.all(
        strategies.map(s => storage.getStrategyPerformance(s.id, 30))
      );
      
      const result: Record<string, StrategyPerformance[]> = {};
      strategies.forEach((strategy, i) => {
        result[strategy.id] = perfList[i];
      });
      
      res.json(result);
    } catch (error) {
      console.error("Get all strategy performance error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/:id
  app.get("/api/strategies/:id", async (req, res) => {
    try {
      const strategy = await storage.getStrategy(req.params.id);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }
      res.json(strategy);
    } catch (error) {
      console.error("Get strategy error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/:id/series
  app.get("/api/strategies/:id/series", async (req, res) => {
    try {
      const series = await storage.getStrategySeries(req.params.id, 90);
      res.json(series);
    } catch (error) {
      console.error("Get strategy series error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/strategies/:id/performance - Get strategy performance with benchmarks
  app.get("/api/strategies/:id/performance", async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 90;
      const performance = await storage.getStrategyPerformance(req.params.id, days);
      res.json(performance);
    } catch (error) {
      console.error("Get strategy performance error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/strategies/seed - Seed strategies (dev only)
  app.post("/api/strategies/seed", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      await storage.seedStrategies();
      res.json({ success: true, message: "Strategies seeded" });
    } catch (error) {
      console.error("Seed strategies error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // MARKET DATA
  // ─────────────────────────────────────────────────────────────────────────────

  const PUBLIC_MAX_CANDLES_PER_REQUEST = 2000;
  const PUBLIC_MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

  const publicMarketLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
  });

  const TIMEFRAME_MS: Record<Timeframe, number> = {
    "1m": 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  // GET /api/public/market/candles
  app.get("/api/public/market/candles", publicMarketLimiter, async (req, res) => {
    try {
      const { symbol, timeframe, start, end, exchange } = req.query;

      // Required params
      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({
          error: { code: "MISSING_SYMBOL", message: "Query param 'symbol' is required" },
        });
      }
      if (!timeframe || typeof timeframe !== "string") {
        return res.status(400).json({
          error: { code: "MISSING_TIMEFRAME", message: "Query param 'timeframe' is required" },
        });
      }
      if (!start || typeof start !== "string") {
        return res.status(400).json({
          error: { code: "MISSING_START", message: "Query param 'start' (epoch ms) is required" },
        });
      }
      if (!end || typeof end !== "string") {
        return res.status(400).json({
          error: { code: "MISSING_END", message: "Query param 'end' (epoch ms) is required" },
        });
      }

      // Validate timeframe
      if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
        return res.status(400).json({
          error: {
            code: "INVALID_TIMEFRAME",
            message: `Invalid timeframe. Allowed: ${VALID_TIMEFRAMES.join(", ")}`,
          },
        });
      }
      const tf = timeframe as Timeframe;
      const tfMs = TIMEFRAME_MS[tf];

      // Parse start/end as integers
      const startMs = parseInt(start, 10);
      const endMs = parseInt(end, 10);
      if (isNaN(startMs) || isNaN(endMs)) {
        return res.status(400).json({
          error: { code: "INVALID_TIMESTAMPS", message: "start and end must be valid integers (epoch ms)" },
        });
      }

      // Validate start < end
      if (startMs >= endMs) {
        return res.status(400).json({
          error: { code: "INVALID_RANGE", message: "start must be less than end" },
        });
      }

      // Validate grid alignment
      if (startMs % tfMs !== 0) {
        return res.status(400).json({
          error: {
            code: "START_NOT_ALIGNED",
            message: `start must be aligned to timeframe grid (start % ${tfMs} === 0)`,
          },
        });
      }
      if (endMs % tfMs !== 0) {
        return res.status(400).json({
          error: {
            code: "END_NOT_ALIGNED",
            message: `end must be aligned to timeframe grid (end % ${tfMs} === 0)`,
          },
        });
      }

      const rangeMs = endMs - startMs;
      if (rangeMs > PUBLIC_MAX_RANGE_MS) {
        return res.status(413).json({
          error: {
            code: "RANGE_TOO_LARGE",
            message: "Requested range exceeds 90 days",
            details: { maxDays: 90 },
          },
        });
      }

      // Validate max candles (derived from timeframe)
      const candleCount = rangeMs / tfMs;
      if (candleCount > PUBLIC_MAX_CANDLES_PER_REQUEST) {
        return res.status(413).json({
          error: {
            code: "TOO_MANY_CANDLES",
            message: `Requested ${candleCount} candles exceeds limit of ${PUBLIC_MAX_CANDLES_PER_REQUEST}`,
            details: { requested: candleCount, limit: PUBLIC_MAX_CANDLES_PER_REQUEST },
          },
        });
      }

      // Exchange default
      const exchangeParam = typeof exchange === "string" ? exchange : "binance_spot";

      // Call Market Data Layer
      const result = await loadCandles({
        exchange: exchangeParam,
        symbol: symbol.toUpperCase(),
        timeframe: tf,
        startMs,
        endMs,
      });

      res.json({
        candles: result.candles,
        gaps: result.gaps,
        source: result.source,
      });
    } catch (error) {
      console.error("Market candles error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // GET /api/operations (protected)
  app.get("/api/operations", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { filter, q, cursor, limit } = req.query;
      const result = await storage.getOperations(
        userId,
        filter as string,
        q as string,
        cursor as string,
        limit ? parseInt(limit as string) : 50
      );
      res.json(result);
    } catch (error) {
      console.error("Get operations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/operations/export - Export operations as CSV (protected)
  // IMPORTANT: Must come BEFORE /api/operations/:id to prevent "export" matching as :id
  app.get("/api/operations/export", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { filter, q } = req.query;
      
      // Use same filters as UI
      const result = await storage.getOperations(
        userId,
        filter as string,
        q as string,
        undefined,
        1000
      );
      const operations = result.operations;

      // Build CSV
      const headers = ["Date", "Type", "Status", "Asset", "Amount", "Fee", "Strategy", "Reference"];
      const rows = operations.map((op) => [
        op.createdAt?.toISOString() || "",
        op.type || "",
        op.status || "",
        op.asset || "",
        op.amount || "",
        op.fee || "",
        op.strategyName || "",
        op.providerRef || op.txHash || "",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="zeon-activity-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error("Export operations error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/operations/:id (protected)
  app.get("/api/operations/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const operation = await storage.getOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ error: "Operation not found" });
      }
      if (operation.userId !== userId) {
        return res.status(404).json({ error: "Operation not found" });
      }
      res.json(operation);
    } catch (error) {
      console.error("Get operation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/statements/summary - Get monthly statement summary (protected)
  app.get("/api/statements/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ error: "year and month are required" });
      }

      const yearNum = parseInt(year as string, 10);
      const monthNum = parseInt(month as string, 10);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }

      // Get operations for the specified month using DB-level date filtering
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

      const operations = await storage.getOperationsByDate(userId, startDate, endDate);

      // Calculate summary
      let totalIn = BigInt(0);
      let totalOut = BigInt(0);
      let totalFees = BigInt(0);
      const inTypes = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT"];
      const outTypes = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"];

      for (const op of operations) {
        if (op.status !== "completed") continue;
        const amount = BigInt(op.amount || "0");
        const fee = BigInt(op.fee || "0");

        if (inTypes.includes(op.type)) {
          totalIn += amount;
        } else if (outTypes.includes(op.type)) {
          totalOut += amount;
        }
        totalFees += fee;
      }

      const net = totalIn - totalOut - totalFees;

      res.json({
        year: yearNum,
        month: monthNum,
        period: `${startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
        operationCount: operations.length,
        completedCount: operations.filter((op) => op.status === "completed").length,
        totalIn: totalIn.toString(),
        totalOut: totalOut.toString(),
        totalFees: totalFees.toString(),
        net: net.toString(),
      });
    } catch (error) {
      console.error("Statement summary error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/statements/monthly - Generate monthly PDF statement (protected)
  app.get("/api/statements/monthly", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { year, month } = req.query;

      if (!year || !month) {
        return res.status(400).json({ error: "year and month are required" });
      }

      const yearNum = parseInt(year as string, 10);
      const monthNum = parseInt(month as string, 10);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }

      // Get operations for the specified month using DB-level date filtering
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

      const operations = await storage.getOperationsByDate(userId, startDate, endDate);

      // Calculate summary
      let totalIn = BigInt(0);
      let totalOut = BigInt(0);
      let totalFees = BigInt(0);
      const inTypes = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT"];
      const outTypes = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"];

      for (const op of operations) {
        if (op.status !== "completed") continue;
        const amount = BigInt(op.amount || "0");
        const fee = BigInt(op.fee || "0");

        if (inTypes.includes(op.type)) {
          totalIn += amount;
        } else if (outTypes.includes(op.type)) {
          totalOut += amount;
        }
        totalFees += fee;
      }

      const net = totalIn - totalOut - totalFees;

      // Generate PDF
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "A4", margin: 50 });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="zeon-statement-${yearNum}-${String(monthNum).padStart(2, "0")}.pdf"`
      );

      // Pipe to response
      doc.pipe(res);

      // Helper function to format amounts
      const formatAmount = (minorUnits: string, decimals: number = 6): string => {
        const value = BigInt(minorUnits || "0");
        const divisor = BigInt(Math.pow(10, decimals));
        const majorPart = value / divisor;
        const remainder = value % divisor;
        const formatted = Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
        return formatted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      // Header
      doc.fontSize(24).font("Helvetica-Bold").text("ZEON", 50, 50);
      doc.fontSize(10).font("Helvetica").fillColor("#666666").text("Monthly Statement", 50, 78);
      
      // Period
      const periodText = `${startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
      doc.fontSize(16).font("Helvetica-Bold").fillColor("#000000").text(periodText, 50, 110);

      // Statement info
      doc.fontSize(9).font("Helvetica").fillColor("#666666");
      doc.text(`Account: ${userId.substring(0, 8)}...${userId.slice(-4)}`, 50, 140);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, 50, 152);

      // Summary box
      const boxY = 180;
      doc.rect(50, boxY, 495, 80).fillAndStroke("#f8f9fa", "#e9ecef");

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000");
      doc.text("Summary", 65, boxY + 12);

      doc.fontSize(9).font("Helvetica").fillColor("#666666");
      const col1 = 65;
      const col2 = 220;
      const col3 = 375;
      
      doc.text("Total In", col1, boxY + 35);
      doc.text("Total Out", col2, boxY + 35);
      doc.text("Net", col3, boxY + 35);

      doc.fontSize(14).font("Helvetica-Bold").fillColor("#22c55e");
      doc.text(`+${formatAmount(totalIn.toString())} USDT`, col1, boxY + 50);
      
      doc.fillColor("#ef4444");
      doc.text(`-${formatAmount(totalOut.toString())} USDT`, col2, boxY + 50);
      
      doc.fillColor(net >= 0 ? "#22c55e" : "#ef4444");
      doc.text(`${net >= 0 ? "+" : ""}${formatAmount(net.toString())} USDT`, col3, boxY + 50);

      // Operations table
      const tableY = boxY + 100;
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000000");
      doc.text("Operations", 50, tableY);
      doc.fontSize(9).fillColor("#666666").font("Helvetica");
      doc.text(`${operations.length} transactions`, 130, tableY + 2);

      // Table header
      const headerY = tableY + 25;
      doc.rect(50, headerY, 495, 20).fill("#f1f5f9");
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#475569");
      doc.text("Date", 55, headerY + 6);
      doc.text("Type", 130, headerY + 6);
      doc.text("Description", 220, headerY + 6);
      doc.text("Amount", 400, headerY + 6);
      doc.text("Status", 480, headerY + 6);

      // Table rows
      let rowY = headerY + 25;
      const maxRowsPerPage = 25;
      let rowCount = 0;

      for (const op of operations) {
        if (rowCount >= maxRowsPerPage && rowCount % maxRowsPerPage === 0) {
          doc.addPage();
          rowY = 50;
        }

        const rowBg = rowCount % 2 === 0 ? "#ffffff" : "#f8fafc";
        doc.rect(50, rowY - 3, 495, 18).fill(rowBg);

        doc.fontSize(8).font("Helvetica").fillColor("#374151");
        
        // Date
        const opDate = op.createdAt ? new Date(op.createdAt) : new Date();
        doc.text(opDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }), 55, rowY);
        
        // Type
        const typeLabels: Record<string, string> = {
          DEPOSIT_USDT: "Deposit",
          DEPOSIT_CARD: "Card Deposit",
          WITHDRAW_USDT: "Withdrawal",
          INVEST: "Investment",
          DAILY_PAYOUT: "Daily Payout",
          PROFIT_PAYOUT: "Profit Payout",
          VAULT_TRANSFER: "Vault Transfer",
          SUBSCRIPTION: "Subscription",
          FX: "Exchange",
        };
        doc.text(typeLabels[op.type] || op.type, 130, rowY);
        
        // Description
        const desc = op.strategyName || op.reason || op.asset || "-";
        doc.text(desc.substring(0, 30), 220, rowY);
        
        // Amount
        const isInflow = inTypes.includes(op.type);
        const amountColor = isInflow ? "#22c55e" : "#374151";
        doc.fillColor(amountColor);
        const amountText = `${isInflow ? "+" : "-"}${formatAmount(op.amount || "0")}`;
        doc.text(amountText, 400, rowY);
        
        // Status
        const statusColors: Record<string, string> = {
          completed: "#22c55e",
          pending: "#f59e0b",
          failed: "#ef4444",
          cancelled: "#6b7280",
        };
        doc.fillColor(statusColors[op.status] || "#374151");
        doc.text(op.status.charAt(0).toUpperCase() + op.status.slice(1), 480, rowY);

        rowY += 18;
        rowCount++;
      }

      if (operations.length === 0) {
        doc.fontSize(10).font("Helvetica").fillColor("#6b7280");
        doc.text("No operations for this period", 50, rowY + 10);
      }

      // Footer
      doc.fontSize(8).font("Helvetica").fillColor("#9ca3af");
      doc.text(
        "This statement is for informational purposes only. ZEON Fintech Dashboard.",
        50,
        doc.page.height - 50,
        { align: "center", width: 495 }
      );

      // Finalize
      doc.end();
    } catch (error) {
      console.error("PDF statement error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/kyc/status - Get KYC status (protected)
  app.get("/api/kyc/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const applicant = await storage.getKycApplicant(userId);
      
      const status = applicant?.status || "NOT_STARTED";
      const { KycTransitions, KycStatus } = await import("@shared/schema");
      const allowedTransitions = KycTransitions[status as keyof typeof KycTransitions] || [];

      res.json({
        status,
        level: applicant?.level || null,
        providerRef: applicant?.providerRef || null,
        submittedAt: applicant?.submittedAt?.toISOString() || null,
        reviewedAt: applicant?.reviewedAt?.toISOString() || null,
        rejectionReason: applicant?.rejectionReason || null,
        needsActionReason: applicant?.needsActionReason || null,
        allowedTransitions,
      });
    } catch (error) {
      console.error("KYC status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/kyc/start - Start KYC process (uses canonical logic)
  app.post("/api/kyc/start", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await startKycCanonical({ userId, ip, userAgent });
      if (result.error) {
        return res.status(result.httpStatus).json({
          error: result.error.message,
          code: result.error.code,
          currentStatus: result.error.currentStatus,
          allowedTransitions: result.error.allowedTransitions,
        });
      }
      res.json({
        success: result.success,
        status: result.status,
        message: result.message,
      });
    } catch (error) {
      console.error("KYC start error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/deposit/usdt/simulate (protected, idempotent, dev only)
  app.post("/api/deposit/usdt/simulate", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const endpoint = "/api/deposit/usdt/simulate";

      // Acquire idempotency lock (atomic)
      const lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
        // No idempotency key provided, continue normally
      }

      const schema = z.object({ amount: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { amount } = parsed.data;

      const balance = await storage.getBalance(userId, "USDT");
      const newAvailable = (BigInt(balance?.available || "0") + BigInt(amount)).toString();
      await storage.updateBalance(userId, "USDT", newAvailable, balance?.locked || "0");

      const operation = await storage.createOperation({
        userId,
        type: "DEPOSIT_USDT",
        status: "completed",
        asset: "USDT",
        amount,
        fee: "0",
        txHash: `0x${randomUUID().replace(/-/g, "")}`,
        providerRef: null,
        strategyId: null,
        strategyName: null,
        fromVault: null,
        toVault: null,
        metadata: null,
        reason: null,
      });

      // Audit log for DEPOSIT_USDT
      await storage.createAuditLog({
        userId,
        event: "DEPOSIT_USDT",
        resourceType: "operation",
        resourceId: operation.id,
        details: {
          amountMinor: amount,
          asset: "USDT",
          idempotencyKey: req.headers["idempotency-key"] || null,
          requestId: req.requestId,
        },
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      const responseBody = { success: true, operation: { id: operation.id } };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Deposit USDT simulate error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/deposit/card/simulate (protected, idempotent, dev only)
  app.post("/api/deposit/card/simulate", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const endpoint = "/api/deposit/card/simulate";

      // Acquire idempotency lock (atomic)
      const lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({ amount: z.string() }); // RUB in kopeks
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { amount } = parsed.data;

      // Convert RUB to USDT using current quote rate
      const rubQuotes = await storage.getQuotes("USDT/RUB", 1);
      const currentRate = rubQuotes.length > 0 ? parseFloat(rubQuotes[0].price) : DEFAULT_RUB_RATE;
      const rubAmount = BigInt(amount);
      // rubAmount is in kopeks (RUB * 100), convert to USDT minor units (6 decimals)
      // Formula: (rubAmount / 100) / rate * 1000000 = rubAmount * 10000 / rate
      const usdtAmount = (rubAmount * BigInt(10000) / BigInt(Math.round(currentRate * 100))).toString();

      const balance = await storage.getBalance(userId, "USDT");
      const newAvailable = (BigInt(balance?.available || "0") + BigInt(usdtAmount)).toString();
      await storage.updateBalance(userId, "USDT", newAvailable, balance?.locked || "0");

      const operation = await storage.createOperation({
        userId,
        type: "DEPOSIT_CARD",
        status: "completed",
        asset: "USDT",
        amount: usdtAmount,
        fee: "0",
        txHash: null,
        providerRef: `CARD-${randomUUID().slice(0, 8).toUpperCase()}`,
        strategyId: null,
        strategyName: null,
        fromVault: null,
        toVault: null,
        metadata: { rubAmount: amount },
        reason: null,
      });

      // Audit log for DEPOSIT_CARD
      await storage.createAuditLog({
        userId,
        event: "DEPOSIT_CARD",
        resourceType: "operation",
        resourceId: operation.id,
        details: {
          amountMinor: usdtAmount,
          asset: "USDT",
          sourceAmount: amount,
          sourceAsset: "RUB",
          idempotencyKey: req.headers["idempotency-key"] || null,
          requestId: req.requestId,
        },
        ip: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });

      const responseBody = { success: true, usdtAmount, operation: { id: operation.id } };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Deposit card simulate error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/invest (protected, idempotent)
  app.post("/api/invest", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const endpoint = "/api/invest";

      // Acquire idempotency lock (atomic)
      const lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({
        strategyId: z.string(),
        amount: z.string(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { strategyId, amount } = parsed.data;

      // Gate checks: consent and KYC required
      const security = await storage.getSecuritySettings(userId);
      const kycApplicant = await storage.getKycApplicant(userId);
      
      if (!security?.consentAccepted) {
        return res.status(403).json({ 
          error: "Consent required",
          code: "CONSENT_REQUIRED",
          message: "Please accept the terms and conditions before investing"
        });
      }
      
      if (kycApplicant?.status !== "APPROVED") {
        return res.status(403).json({ 
          error: "KYC required",
          code: "KYC_REQUIRED",
          message: "Please complete identity verification before investing"
        });
      }

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      // Check if position is paused (risk control)
      const existingPosition = await storage.getPosition(userId, strategyId);
      if (existingPosition?.paused) {
        return res.status(403).json({ 
          error: "Strategy paused",
          code: "STRATEGY_PAUSED",
          message: existingPosition.pausedReason === "dd_breach" 
            ? "This strategy is paused due to drawdown limit breach. Please review your risk settings."
            : "This strategy is currently paused. Resume it to make new investments."
        });
      }

      const balance = await storage.getBalance(userId, "USDT");
      if (BigInt(balance?.available || "0") < BigInt(amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      if (BigInt(amount) < BigInt(strategy.minInvestment)) {
        return res.status(400).json({ error: "Amount below minimum investment" });
      }

      // ATOMIC TRANSACTION: balance + position + operation + audit
      const operation = await withTransaction(async (tx) => {
        // Re-fetch balance within transaction for consistency
        const [currentBalance] = await tx.select().from(balances)
          .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
        
        if (!currentBalance || BigInt(currentBalance.available) < BigInt(amount)) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        // Calculate new balance with invariant check
        const newAvailable = BigInt(currentBalance.available) - BigInt(amount);
        assertNonNegative(newAvailable, "USDT balance");

        // Update balance atomically
        await tx.update(balances)
          .set({ available: newAvailable.toString(), updatedAt: new Date() })
          .where(eq(balances.id, currentBalance.id));

        // Create or update position
        const [existingPos] = await tx.select().from(positions)
          .where(and(eq(positions.userId, userId), eq(positions.strategyId, strategyId)));
        
        if (existingPos) {
          await tx.update(positions)
            .set({
              principal: (BigInt(existingPos.principal) + BigInt(amount)).toString(),
              currentValue: (BigInt(existingPos.currentValue) + BigInt(amount)).toString(),
              updatedAt: new Date(),
            })
            .where(eq(positions.id, existingPos.id));
        } else {
          await tx.insert(positions).values({
            userId,
            strategyId,
            principal: amount,
            currentValue: amount,
          });
        }

        // Create operation record
        const [op] = await tx.insert(operations).values({
          userId,
          type: "INVEST",
          status: "completed",
          asset: "USDT",
          amount,
          fee: "0",
          txHash: null,
          providerRef: null,
          strategyId,
          strategyName: strategy.name,
          fromVault: null,
          toVault: null,
          metadata: null,
          reason: null,
        }).returning();

        // Audit log
        await tx.insert(auditLogs).values({
          userId,
          event: "INVEST",
          resourceType: "operation",
          resourceId: op.id,
          details: {
            amountMinor: amount,
            asset: "USDT",
            strategyId,
            idempotencyKey: req.headers["idempotency-key"] || null,
            requestId: req.requestId,
          },
          ip: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });

        return op;
      });

      const responseBody = { success: true, operation: { id: operation.id } };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Invest error:", error);
      if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/payout/daily - Demo daily payout simulation (protected, dev only)
  app.post("/api/payout/daily", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const positions = await storage.getPositions(userId);
      
      for (const position of positions) {
        // Simulate ~0.1-0.3% daily return
        const dailyReturn = 0.001 + Math.random() * 0.002;
        const payoutAmount = Math.round(parseFloat(position.currentValue) * dailyReturn).toString();

        // Update position value
        const newCurrentValue = (BigInt(position.currentValue) + BigInt(payoutAmount)).toString();
        await storage.updatePosition(position.id, { currentValue: newCurrentValue });

        // Credit to balance
        const balance = await storage.getBalance(userId, "USDT");
        const newAvailable = (BigInt(balance?.available || "0") + BigInt(payoutAmount)).toString();
        await storage.updateBalance(userId, "USDT", newAvailable, balance?.locked || "0");

        const strategy = await storage.getStrategy(position.strategyId);

        // Create payout operation
        const payoutOperation = await storage.createOperation({
          userId,
          type: "DAILY_PAYOUT",
          status: "completed",
          asset: "USDT",
          amount: payoutAmount,
          fee: "0",
          txHash: null,
          providerRef: null,
          strategyId: position.strategyId,
          strategyName: strategy?.name || null,
          fromVault: null,
          toVault: null,
          metadata: null,
          reason: null,
        });

        // Audit log for DAILY_PAYOUT
        await storage.createAuditLog({
          userId,
          event: "DAILY_PAYOUT",
          resourceType: "operation",
          resourceId: payoutOperation.id,
          details: {
            amountMinor: payoutAmount,
            asset: "USDT",
            strategyId: position.strategyId,
            requestId: req.requestId,
          },
          ip: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });

        // Auto-sweep: check each vault for enabled auto-sweep (atomic transaction)
        const userVaults = await storage.getVaults(userId);
        for (const vault of userVaults) {
          if (vault.autoSweepEnabled && vault.autoSweepPct && vault.autoSweepPct > 0) {
            // Calculate sweep amount based on percentage of profit delta
            const sweepAmount = BigInt(payoutAmount) * BigInt(vault.autoSweepPct) / 100n;
            if (sweepAmount <= 0n) continue;

            const sweepAmountStr = sweepAmount.toString();
            const vaultType = vault.type;
            const vaultPct = vault.autoSweepPct;
            const vaultGoalName = vault.goalName;

            // ATOMIC TRANSACTION: wallet deduct + vault credit + operation + audit
            const sweepOperation = await withTransaction(async (tx) => {
              // Re-fetch wallet balance within transaction
              const [currentBalance] = await tx.select().from(balances)
                .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
              
              if (!currentBalance || BigInt(currentBalance.available) < sweepAmount) {
                throw new Error("INSUFFICIENT_BALANCE_FOR_AUTO_SWEEP");
              }

              // Re-fetch vault within transaction - MUST exist (auto-sweep only enabled on existing vaults)
              const [currentVault] = await tx.select().from(vaults)
                .where(and(eq(vaults.userId, userId), eq(vaults.type, vaultType)));
              
              if (!currentVault) {
                throw new Error("VAULT_NOT_FOUND_FOR_AUTO_SWEEP");
              }

              // Calculate new balances with invariant checks
              const afterSweep = BigInt(currentBalance.available) - sweepAmount;
              assertNonNegative(afterSweep, "wallet balance (auto-sweep)");

              const newVaultBalance = BigInt(currentVault.balance || "0") + sweepAmount;
              assertNonNegative(newVaultBalance, "vault balance (auto-sweep)");

              // Deduct from wallet
              await tx.update(balances)
                .set({ available: afterSweep.toString(), updatedAt: new Date() })
                .where(eq(balances.id, currentBalance.id));

              // Credit to vault
              await tx.update(vaults)
                .set({ balance: newVaultBalance.toString(), updatedAt: new Date() })
                .where(eq(vaults.id, currentVault.id));

              // Create sweep operation
              const [op] = await tx.insert(operations).values({
                userId,
                type: "VAULT_TRANSFER",
                status: "completed",
                asset: "USDT",
                amount: sweepAmountStr,
                fee: "0",
                txHash: null,
                providerRef: null,
                strategyId: null,
                strategyName: null,
                fromVault: "wallet",
                toVault: vaultType,
                metadata: { autoSweep: true, sweepPct: vaultPct },
                reason: "AUTO_SWEEP",
              }).returning();

              // Audit log
              await tx.insert(auditLogs).values({
                userId,
                event: "VAULT_TRANSFER_AUTO_SWEEP",
                resourceType: "operation",
                resourceId: op.id,
                details: {
                  amountMinor: sweepAmountStr,
                  asset: "USDT",
                  fromVault: "wallet",
                  toVault: vaultType,
                  autoSweep: true,
                  sweepPct: vaultPct,
                  profitDelta: payoutAmount,
                  requestId: req.requestId,
                },
                ip: req.ip || null,
                userAgent: req.headers["user-agent"] || null,
              });

              return op;
            });

            // Create notification for auto-sweep (outside transaction, non-critical)
            await storage.createNotification({
              userId,
              type: "transaction",
              title: "Auto-sweep executed",
              message: `${formatMoney(sweepAmountStr, "USDT")} swept to ${vaultGoalName || vaultType} vault (${vaultPct}% of profit)`,
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Daily payout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/withdraw/usdt (protected, idempotent)
  app.post("/api/withdraw/usdt", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const endpoint = "/api/withdraw/usdt";

      // Acquire idempotency lock (atomic)
      const lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({
        amount: z.string(),
        address: z.string().min(30),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { amount, address } = parsed.data;

      const security = await storage.getSecuritySettings(userId);
      const kycApplicant = await storage.getKycApplicant(userId);

      // Gate checks: consent required
      if (!security?.consentAccepted) {
        return res.status(403).json({ 
          error: "Consent required",
          code: "CONSENT_REQUIRED",
          message: "Please accept the terms and conditions before withdrawing"
        });
      }

      // Gate checks: KYC required
      if (kycApplicant?.status !== "APPROVED") {
        return res.status(403).json({ 
          error: "KYC required",
          code: "KYC_REQUIRED",
          message: "Please complete identity verification before withdrawing"
        });
      }

      // Check 2FA
      if (!security?.twoFactorEnabled) {
        return res.status(403).json({ 
          error: "2FA required",
          code: "TWO_FACTOR_REQUIRED",
          message: "Please enable two-factor authentication before withdrawing"
        });
      }

      // Check whitelist and activation delay
      if (security?.whitelistEnabled) {
        const whitelist = await storage.getWhitelistAddresses(userId);
        const whitelisted = whitelist.find((w) => w.address === address && w.status === "active");
        if (!whitelisted) {
          return res.status(403).json({ 
            error: "Whitelist required",
            code: "WHITELIST_REQUIRED",
            message: "Address not in whitelist or not yet active"
          });
        }
        // Check activation delay has passed
        if (whitelisted.activatesAt && new Date(whitelisted.activatesAt) > new Date()) {
          return res.status(403).json({ 
            error: "Address not yet active",
            code: "ADDRESS_DELAY_PENDING",
            message: `Address will be active after ${whitelisted.activatesAt.toISOString()}`
          });
        }
      }

      const balance = await storage.getBalance(userId, "USDT");
      const fee = NETWORK_FEE_MINOR;
      const totalDeduct = BigInt(amount) + BigInt(fee);
      
      // Check balance includes fee
      if (BigInt(balance?.available || "0") < totalDeduct) {
        return res.status(400).json({ error: "Insufficient balance (including network fee)" });
      }

      // ATOMIC TRANSACTION: balance deduct + operation + audit
      const operation = await withTransaction(async (tx) => {
        // Re-fetch balance within transaction
        const [currentBalance] = await tx.select().from(balances)
          .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
        
        if (!currentBalance || BigInt(currentBalance.available) < totalDeduct) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        // Calculate new balance with invariant check
        const newAvailable = BigInt(currentBalance.available) - totalDeduct;
        assertNonNegative(newAvailable, "USDT balance");

        // Update balance atomically
        await tx.update(balances)
          .set({ available: newAvailable.toString(), updatedAt: new Date() })
          .where(eq(balances.id, currentBalance.id));

        // Create withdrawal operation
        const [op] = await tx.insert(operations).values({
          userId,
          type: "WITHDRAW_USDT",
          status: "completed",
          asset: "USDT",
          amount,
          fee,
          txHash: `0x${randomUUID().replace(/-/g, "")}`,
          providerRef: null,
          strategyId: null,
          strategyName: null,
          fromVault: null,
          toVault: null,
          metadata: { address },
          reason: null,
        }).returning();

        // Audit log (no address for privacy)
        await tx.insert(auditLogs).values({
          userId,
          event: "WITHDRAW_USDT",
          resourceType: "operation",
          resourceId: op.id,
          details: {
            amountMinor: amount,
            feeMinor: fee,
            asset: "USDT",
            idempotencyKey: req.headers["idempotency-key"] || null,
            requestId: req.requestId,
          },
          ip: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });

        return op;
      });

      const responseBody = { success: true, operation: { id: operation.id } };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Withdraw error:", error);
      if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/vault/transfer (protected, idempotent)
  app.post("/api/vault/transfer", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const endpoint = "/api/vault/transfer";

      // Acquire idempotency lock (atomic)
      const lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({
        fromVault: z.string(),
        toVault: z.string(),
        amount: z.string(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { fromVault, toVault, amount } = parsed.data;

      if (fromVault === toVault) {
        return res.status(400).json({ error: "Source and destination must be different" });
      }

      // ATOMIC TRANSACTION: source deduct + dest credit + operation + audit
      const operation = await withTransaction(async (tx) => {
        if (fromVault === "wallet") {
          // Transfer from wallet to vault
          const [currentBalance] = await tx.select().from(balances)
            .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
          
          if (!currentBalance || BigInt(currentBalance.available) < BigInt(amount)) {
            throw new Error("INSUFFICIENT_BALANCE");
          }

          const newAvailable = BigInt(currentBalance.available) - BigInt(amount);
          assertNonNegative(newAvailable, "USDT balance");

          await tx.update(balances)
            .set({ available: newAvailable.toString(), updatedAt: new Date() })
            .where(eq(balances.id, currentBalance.id));

          const [vault] = await tx.select().from(vaults)
            .where(and(eq(vaults.userId, userId), eq(vaults.type, toVault)));
          
          const newVaultBalance = (BigInt(vault?.balance || "0") + BigInt(amount)).toString();
          if (vault) {
            await tx.update(vaults)
              .set({ balance: newVaultBalance, updatedAt: new Date() })
              .where(eq(vaults.id, vault.id));
          } else {
            await tx.insert(vaults).values({ userId, type: toVault, asset: "USDT", balance: newVaultBalance });
          }
        } else if (toVault === "wallet") {
          // Transfer from vault to wallet
          const [vault] = await tx.select().from(vaults)
            .where(and(eq(vaults.userId, userId), eq(vaults.type, fromVault)));
          
          if (!vault || BigInt(vault.balance) < BigInt(amount)) {
            throw new Error("INSUFFICIENT_VAULT_BALANCE");
          }

          const newVaultBalance = BigInt(vault.balance) - BigInt(amount);
          assertNonNegative(newVaultBalance, `${fromVault} vault`);

          await tx.update(vaults)
            .set({ balance: newVaultBalance.toString(), updatedAt: new Date() })
            .where(eq(vaults.id, vault.id));

          const [currentBalance] = await tx.select().from(balances)
            .where(and(eq(balances.userId, userId), eq(balances.asset, "USDT")));
          
          const newAvailable = (BigInt(currentBalance?.available || "0") + BigInt(amount)).toString();
          if (currentBalance) {
            await tx.update(balances)
              .set({ available: newAvailable, updatedAt: new Date() })
              .where(eq(balances.id, currentBalance.id));
          } else {
            await tx.insert(balances).values({ userId, asset: "USDT", available: newAvailable, locked: "0" });
          }
        } else {
          // Vault to vault transfer
          const [sourceVault] = await tx.select().from(vaults)
            .where(and(eq(vaults.userId, userId), eq(vaults.type, fromVault)));
          
          if (!sourceVault || BigInt(sourceVault.balance) < BigInt(amount)) {
            throw new Error("INSUFFICIENT_VAULT_BALANCE");
          }

          const newSourceBalance = BigInt(sourceVault.balance) - BigInt(amount);
          assertNonNegative(newSourceBalance, `${fromVault} vault`);

          await tx.update(vaults)
            .set({ balance: newSourceBalance.toString(), updatedAt: new Date() })
            .where(eq(vaults.id, sourceVault.id));

          const [destVault] = await tx.select().from(vaults)
            .where(and(eq(vaults.userId, userId), eq(vaults.type, toVault)));
          
          const newDestBalance = (BigInt(destVault?.balance || "0") + BigInt(amount)).toString();
          if (destVault) {
            await tx.update(vaults)
              .set({ balance: newDestBalance, updatedAt: new Date() })
              .where(eq(vaults.id, destVault.id));
          } else {
            await tx.insert(vaults).values({ userId, type: toVault, asset: "USDT", balance: newDestBalance });
          }
        }

        // Create operation record
        const [op] = await tx.insert(operations).values({
          userId,
          type: "VAULT_TRANSFER",
          status: "completed",
          asset: "USDT",
          amount,
          fee: "0",
          txHash: null,
          providerRef: null,
          strategyId: null,
          strategyName: null,
          fromVault,
          toVault,
          metadata: null,
          reason: null,
        }).returning();

        // Audit log
        await tx.insert(auditLogs).values({
          userId,
          event: "VAULT_TRANSFER",
          resourceType: "operation",
          resourceId: op.id,
          details: {
            amountMinor: amount,
            asset: "USDT",
            fromVault,
            toVault,
            idempotencyKey: req.headers["idempotency-key"] || null,
            requestId: req.requestId,
          },
          ip: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });

        return op;
      });

      const responseBody = { success: true, operation: { id: operation.id } };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Vault transfer error:", error);
      if (error instanceof Error) {
        if (error.message === "INSUFFICIENT_BALANCE") {
          return res.status(400).json({ error: "Insufficient wallet balance" });
        }
        if (error.message === "INSUFFICIENT_VAULT_BALANCE") {
          return res.status(400).json({ error: "Insufficient vault balance" });
        }
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/2fa/toggle (protected)
  app.post("/api/security/2fa/toggle", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { enabled } = parsed.data;

      await storage.updateSecuritySettings(userId, { twoFactorEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("2FA toggle error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/whitelist/toggle (protected)
  app.post("/api/security/whitelist/toggle", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { enabled } = parsed.data;

      await storage.updateSecuritySettings(userId, { whitelistEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("Whitelist toggle error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/security/whitelist (protected)
  app.get("/api/security/whitelist", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const addresses = await storage.getWhitelistAddresses(userId);
      res.json(addresses);
    } catch (error) {
      console.error("Get whitelist error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/whitelist/add (protected)
  app.post("/api/security/whitelist/add", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        address: z.string().min(30),
        label: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { address, label } = parsed.data;

      const security = await storage.getSecuritySettings(userId);
      const delay = security?.addressDelay || 0;

      const activatesAt = delay > 0 ? new Date(Date.now() + delay * 60 * 60 * 1000) : new Date();
      const status = delay > 0 ? "pending" : "active";

      await storage.createWhitelistAddress({
        userId,
        address,
        label: label || null,
        network: "TRC20",
        status,
        activatesAt,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Add whitelist address error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/whitelist/remove (protected)
  app.post("/api/security/whitelist/remove", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ addressId: z.string() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { addressId } = parsed.data;

      // IDOR protection: verify ownership before delete
      const address = await storage.getWhitelistAddress(addressId);
      if (!address || address.userId !== userId) {
        return res.status(404).json({ error: "Address not found" });
      }

      await storage.deleteWhitelistAddress(addressId);
      res.json({ success: true });
    } catch (error) {
      console.error("Remove whitelist address error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/address-delay (protected)
  app.post("/api/security/address-delay", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ delay: z.number().min(0).max(24) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { delay } = parsed.data;

      await storage.updateSecuritySettings(userId, { addressDelay: delay });
      res.json({ success: true });
    } catch (error) {
      console.error("Address delay error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/anti-phishing (protected)
  app.post("/api/security/anti-phishing", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ code: z.string().min(1).max(20) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { code } = parsed.data;

      await storage.updateSecuritySettings(userId, { antiPhishingCode: code });
      res.json({ success: true });
    } catch (error) {
      console.error("Anti-phishing error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/auto-sweep (protected)
  app.post("/api/security/auto-sweep", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { enabled } = parsed.data;

      await storage.updateSecuritySettings(userId, { autoSweepEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("Auto-sweep toggle error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/vault/goal (protected) - Update vault goal settings
  app.post("/api/vault/goal", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { updateVaultGoalSchema } = await import("@shared/schema");
      const { type, goalName, goalAmount, autoSweepPct, autoSweepEnabled } = updateVaultGoalSchema.parse(req.body);

      const vault = await storage.updateVaultGoal(userId, type, {
        goalName,
        goalAmount,
        autoSweepPct,
        autoSweepEnabled,
      });

      res.json({ success: true, vault });
    } catch (error) {
      console.error("Update vault goal error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== ONBOARDING ROUTES ====================

  // POST /api/onboarding/send-code (protected) - Demo: just returns success
  app.post("/api/onboarding/send-code", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      // Demo: In production, would send actual OTP via email/SMS
      res.json({ success: true, message: "Code sent" });
    } catch (error) {
      console.error("Send code error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/verify-code (protected) - Demo: accepts any 6-digit code
  app.post("/api/onboarding/verify-code", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ code: z.string().length(6) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { code } = parsed.data;

      // Demo: Accept any 6-digit code
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Invalid code format" });
      }

      await storage.updateSecuritySettings(userId, { contactVerified: true });
      res.json({ success: true });
    } catch (error) {
      console.error("Verify code error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/accept-consent (protected) - Uses canonical consent logic
  app.post("/api/onboarding/accept-consent", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await acceptConsentCanonical({ userId, ip, userAgent });
      res.json({ success: result.success });
    } catch (error) {
      console.error("Accept consent error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/start-kyc (protected) - Uses canonical KYC logic
  app.post("/api/onboarding/start-kyc", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await startKycCanonical({ userId, ip, userAgent });
      if (result.error) {
        return res.status(result.httpStatus).json({
          error: result.error.message,
          code: result.error.code,
          currentStatus: result.error.currentStatus,
          allowedTransitions: result.error.allowedTransitions,
        });
      }
      res.json({ success: result.success, status: result.status });
    } catch (error) {
      console.error("Start KYC error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/complete-kyc (protected) - Demo: approves KYC
  app.post("/api/onboarding/complete-kyc", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      // Update kycApplicants table (single source of truth)
      await storage.upsertKycApplicant(userId, {
        status: "APPROVED",
        level: "basic",
        providerRef: `demo-${userId}`,
        reviewedAt: new Date(),
      });
      res.json({ success: true, status: "APPROVED" });
    } catch (error) {
      console.error("Complete KYC error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== CONSENT ROUTES ====================

  // GET /api/consent/status (protected)
  app.get("/api/consent/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const latestConsent = await storage.getLatestConsent(userId, "combined");

      const hasAccepted = !!latestConsent;
      const needsReaccept = latestConsent?.version !== CURRENT_CONSENT_VERSION;

      res.json({
        hasAccepted,
        currentVersion: latestConsent?.version || null,
        requiredVersion: CURRENT_CONSENT_VERSION,
        needsReaccept: hasAccepted && needsReaccept,
        lastAcceptedAt: latestConsent?.acceptedAt?.toISOString() || null,
        documentHash: CURRENT_DOC_HASH,
      });
    } catch (error) {
      console.error("Consent status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/consent/accept (protected, idempotent) - Uses canonical consent logic
  app.post("/api/consent/accept", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      const result = await acceptConsentCanonical({ userId, ip, userAgent });
      res.json(result);
    } catch (error) {
      console.error("Accept consent error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== SUMSUB INTEGRATION (DEMO) ====================

  // GET /api/sumsub/access-token - Generate access token for SDK (demo mode)
  app.get("/api/sumsub/access-token", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // In production, this would call Sumsub's API to generate a token
      // For demo, we generate a mock token
      const mockToken = `demo_${userId}_${Date.now()}`;
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      // Check if applicant exists, create if not
      let applicant = await storage.getKycApplicant(userId);
      if (!applicant) {
        applicant = await storage.createKycApplicant({
          userId,
          status: "NOT_STARTED",
          level: "basic",
          providerRef: `sumsub_${userId}`,
        });
      }

      res.json({
        token: mockToken,
        expiresAt,
        applicantId: applicant.providerRef || `sumsub_${userId}`,
        flowName: "basic-kyc-demo",
        isDemoMode: true,
      });
    } catch (error) {
      console.error("Sumsub access token error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/sumsub/webhook - Handle Sumsub callbacks (demo mode)
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET;
  
  app.post("/api/sumsub/webhook", async (req, res) => {
    try {
      // In production, require webhook secret
      if (IS_PRODUCTION && !SUMSUB_WEBHOOK_SECRET) {
        console.error("Sumsub webhook: SUMSUB_WEBHOOK_SECRET not configured");
        return res.status(500).json({ error: "Service not configured" });
      }

      const effectiveSecret = SUMSUB_WEBHOOK_SECRET || "demo-webhook-secret";

      // Verify webhook secret
      const webhookSecret = req.headers["x-sumsub-secret"] || req.headers["x-webhook-secret"];
      const expectedSecret = effectiveSecret;
      
      if (webhookSecret !== expectedSecret) {
        console.warn("Sumsub webhook: invalid or missing secret");
        return res.status(401).json({ error: "Unauthorized" });
      }

      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody)) {
        return res.status(400).json({ error: "Invalid raw body" });
      }

      const digestHeader = req.headers["x-payload-digest"];
      const algHeader = req.headers["x-payload-digest-alg"];
      const digestValue = Array.isArray(digestHeader) ? digestHeader[0] : digestHeader;
      const algValue = Array.isArray(algHeader) ? algHeader[0] : algHeader;

      const signatureOk = verifySumsubSignature(rawBody, algValue, digestValue, effectiveSecret);
      if (!signatureOk) {
        console.warn("Sumsub webhook: invalid signature");
        return res.status(401).json({ error: "Unauthorized" });
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return res.status(400).json({ error: "Invalid JSON payload" });
      }

      // Validate request body with Zod
      const webhookSchema = z.object({
        applicantId: z.string().min(1),
        type: z.enum(["applicantReviewed", "applicantPending", "applicantOnHold"]),
        reviewResult: z.object({
          reviewAnswer: z.enum(["GREEN", "RED", "YELLOW"]).optional(),
          rejectLabels: z.array(z.string()).optional(),
          moderationComment: z.string().optional(),
        }).optional(),
      });

      const parseResult = webhookSchema.safeParse(parsedBody);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid payload", details: parseResult.error.issues });
      }

      const { applicantId, reviewResult, type } = parseResult.data;
      
      if (!applicantId) {
        return res.status(400).json({ error: "Missing applicantId" });
      }

      // Look up applicant by providerRef (the actual stored reference)
      // This prevents applicantId manipulation attacks
      const applicant = await storage.getKycApplicantByProviderRef(applicantId);
      
      if (!applicant) {
        console.warn(`Sumsub webhook: unknown applicantId ${applicantId}`);
        return res.status(404).json({ error: "Applicant not found" });
      }

      const userId = applicant.userId;

      const previousStatus = applicant.status;
      let newStatus: string | null = null;
      let rejectionReason: string | null = null;
      let needsActionReason: string | null = null;

      // Map Sumsub review result to KYC status
      if (type === "applicantReviewed" || type === "applicantPending") {
        const reviewAnswer = reviewResult?.reviewAnswer;
        
        if (reviewAnswer === "GREEN") {
          newStatus = "APPROVED";
        } else if (reviewAnswer === "RED") {
          newStatus = "REJECTED";
          rejectionReason = reviewResult?.rejectLabels?.join(", ") || "Identity verification failed";
        } else if (reviewAnswer === "YELLOW") {
          newStatus = "NEEDS_ACTION";
          needsActionReason = reviewResult?.moderationComment || "Additional documents required";
        } else if (type === "applicantPending") {
          newStatus = "IN_REVIEW";
        }
      } else if (type === "applicantOnHold") {
        newStatus = "ON_HOLD";
      }

      if (newStatus && newStatus !== previousStatus) {
        await storage.updateKycApplicant(userId, {
          status: newStatus,
          reviewedAt: ["APPROVED", "REJECTED"].includes(newStatus) ? new Date() : undefined,
          rejectionReason,
          needsActionReason,
        });

        // Update security settings if approved
        if (newStatus === "APPROVED") {
          await storage.updateSecuritySettings(userId, { kycStatus: "approved" });
        }

        // Create audit log
        const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
        await storage.createAuditLog({
          userId,
          event: "KYC_STATUS_CHANGED",
          resourceType: "kyc",
          resourceId: applicant.id,
          details: { previousStatus, newStatus, source: "sumsub_webhook", type },
          ip,
          userAgent: "sumsub-webhook",
        });

        // Create notification
        const notificationMessages: Record<string, { title: string; message: string }> = {
          APPROVED: { title: "KYC Approved", message: "Your identity has been successfully verified." },
          REJECTED: { title: "KYC Rejected", message: rejectionReason || "Your verification was not successful." },
          NEEDS_ACTION: { title: "Action Required", message: needsActionReason || "Additional documents are needed." },
          ON_HOLD: { title: "Verification On Hold", message: "Your verification is temporarily on hold." },
          IN_REVIEW: { title: "Verification In Progress", message: "Your documents are being reviewed." },
        };

        const notification = notificationMessages[newStatus];
        if (notification) {
          await storage.createNotification({
            userId,
            type: "kyc",
            title: notification.title,
            message: notification.message,
            resourceType: "kyc",
            resourceId: applicant.id,
          });
        }
      }

      res.json({ success: true, status: newStatus || previousStatus });
    } catch (error) {
      console.error("Sumsub webhook error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/sumsub/demo-callback - Trigger a demo callback (for testing)
  app.post("/api/sumsub/demo-callback", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Validate request body with Zod
      const demoCallbackSchema = z.object({
        status: z.enum(["APPROVED", "REJECTED", "NEEDS_ACTION", "ON_HOLD"]),
      });

      const parseResult = demoCallbackSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid status", 
          validStatuses: ["APPROVED", "REJECTED", "NEEDS_ACTION", "ON_HOLD"],
          details: parseResult.error.issues
        });
      }

      const { status } = parseResult.data;

      const applicant = await storage.getKycApplicant(userId);
      if (!applicant) {
        return res.status(400).json({ error: "No KYC application found. Start KYC first." });
      }

      // Simulate a Sumsub webhook callback
      const reviewResult: Record<string, unknown> = {};
      if (status === "APPROVED") {
        reviewResult.reviewAnswer = "GREEN";
      } else if (status === "REJECTED") {
        reviewResult.reviewAnswer = "RED";
        reviewResult.rejectLabels = ["DOCUMENT_DAMAGED", "FORGERY"];
      } else if (status === "NEEDS_ACTION") {
        reviewResult.reviewAnswer = "YELLOW";
        reviewResult.moderationComment = "Please upload a clearer photo of your ID";
      }

      // Call our own webhook endpoint to simulate
      const webhookBody = {
        applicantId: applicant.providerRef || `sumsub_${userId}`,
        type: status === "ON_HOLD" ? "applicantOnHold" : "applicantReviewed",
        reviewResult,
      };

      // Process inline (in production this would be an HTTP call)
      const previousStatus = applicant.status;
      let newStatus = status;
      let rejectionReason: string | null = null;
      let needsActionReason: string | null = null;

      if (status === "REJECTED") {
        rejectionReason = "Document damaged, possible forgery detected";
      } else if (status === "NEEDS_ACTION") {
        needsActionReason = "Please upload a clearer photo of your ID";
      }

      await storage.updateKycApplicant(userId, {
        status: newStatus,
        reviewedAt: ["APPROVED", "REJECTED"].includes(newStatus) ? new Date() : undefined,
        rejectionReason,
        needsActionReason,
      });

      if (newStatus === "APPROVED") {
        await storage.updateSecuritySettings(userId, { kycStatus: "approved" });
      }

      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      await storage.createAuditLog({
        userId,
        event: "KYC_STATUS_CHANGED",
        resourceType: "kyc",
        resourceId: applicant.id,
        details: { previousStatus, newStatus, source: "demo_callback" },
        ip,
        userAgent: req.headers["user-agent"] || "demo",
      });

      await storage.createNotification({
        userId,
        type: "kyc",
        title: `KYC ${status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ")}`,
        message: `Demo: KYC status changed to ${status}`,
        resourceType: "kyc",
        resourceId: applicant.id,
      });

      res.json({ success: true, previousStatus, newStatus });
    } catch (error) {
      console.error("Sumsub demo callback error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/fx/quote - Demo FX quote
  app.post("/api/fx/quote", devOnlyGuard, async (req, res) => {
    try {
      const schema = z.object({
        fromAsset: z.string(),
        toAsset: z.string(),
        amount: z.string(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { fromAsset, toAsset, amount } = parsed.data;

      // Demo rates (using configurable default)
      const rates: Record<string, Record<string, number>> = {
        RUB: { USDT: 1 / DEFAULT_RUB_RATE },
        USDT: { RUB: DEFAULT_RUB_RATE },
      };

      const rate = rates[fromAsset]?.[toAsset] || 1;
      const toAmount = Math.round(parseFloat(amount) * rate).toString();

      res.json({ fromAsset, toAsset, fromAmount: amount, toAmount, rate: rate.toString() });
    } catch (error) {
      console.error("FX quote error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== NOTIFICATION ROUTES ====================

  // GET /api/notifications (protected) - returns InboxCard format
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const unreadOnly = req.query.unreadOnly === "true";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const notificationsData = await storage.getNotifications(userId, unreadOnly, limit);
      const unreadCount = await storage.getUnreadNotificationCount(userId);
      
      const { getNotificationCta, normalizeNotificationType } = await import("@shared/schema");
      
      res.json({
        notifications: notificationsData.map((n) => {
          const normalizedType = normalizeNotificationType(n.type);
          const cta = getNotificationCta(n.type, n.resourceType, n.resourceId);
          return {
            id: n.id,
            type: normalizedType,
            title: n.title,
            message: n.message,
            isRead: n.isRead,
            createdAt: n.createdAt?.toISOString(),
            ctaLabel: cta.label,
            ctaPath: cta.path,
          };
        }),
        unreadCount,
      });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/notifications/count (protected)
  app.get("/api/notifications/count", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const unreadCount = await storage.getUnreadNotificationCount(userId);
      res.json({ unreadCount });
    } catch (error) {
      console.error("Get notification count error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/notifications/:id/read (protected)
  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const notificationId = req.params.id;

      // IDOR protection: verify ownership before update
      const notification = await storage.getNotification(notificationId);
      if (!notification || notification.userId !== userId) {
        return res.status(404).json({ error: "Notification not found" });
      }

      await storage.markNotificationRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/notifications/read-all (protected)
  app.post("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/notifications/seed - Seed demo notifications (protected, dev only)
  app.post("/api/notifications/seed", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const operations = await storage.getOperations(userId, undefined, undefined, undefined, 5);
      const operationId = operations.operations[0]?.id;
      
      const demoNotifications = [
        {
          userId,
          type: "transaction",
          title: "Deposit completed",
          message: "Your USDT deposit of 500.00 has been credited to your wallet",
          resourceType: "operation",
          resourceId: operationId || null,
          isRead: false,
        },
        {
          userId,
          type: "kyc",
          title: "Verification required",
          message: "Complete your identity verification to unlock all features",
          resourceType: "kyc",
          resourceId: null,
          isRead: false,
        },
        {
          userId,
          type: "security",
          title: "New login detected",
          message: "A new login was detected from Chrome on Windows. If this wasn't you, secure your account.",
          resourceType: "security",
          resourceId: null,
          isRead: false,
        },
        {
          userId,
          type: "system",
          title: "Scheduled maintenance",
          message: "Scheduled maintenance on Jan 20 from 2:00 AM to 4:00 AM UTC. Some features may be unavailable.",
          resourceType: null,
          resourceId: null,
          isRead: true,
        },
        {
          userId,
          type: "transaction",
          title: "Profit payout received",
          message: "Daily profit payout of 12.45 USDT has been added to your Profit Vault",
          resourceType: "operation",
          resourceId: null,
          isRead: false,
        },
      ];
      
      for (const n of demoNotifications) {
        await storage.createNotification(n);
      }
      
      res.json({ success: true, count: demoNotifications.length });
    } catch (error) {
      console.error("Seed notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== PAYOUT INSTRUCTIONS ROUTES ====================

  // GET /api/payout-instructions (protected)
  app.get("/api/payout-instructions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const instructions = await storage.getPayoutInstructions(userId);
      res.json(instructions);
    } catch (error) {
      console.error("Get payout instructions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/payout-instructions/:strategyId (protected)
  app.get("/api/payout-instructions/:strategyId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const instruction = await storage.getPayoutInstruction(userId, req.params.strategyId);
      res.json(instruction || null);
    } catch (error) {
      console.error("Get payout instruction error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/payout-instructions (protected)
  app.post("/api/payout-instructions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        strategyId: z.string(),
        frequency: z.enum(["DAILY", "MONTHLY"]),
        addressId: z.string().optional(),
        minPayoutMinor: z.string().default("10000000"), // 10 USDT
        active: z.boolean().default(false),
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request", details: parseResult.error.issues });
      }

      const { strategyId, frequency, addressId, minPayoutMinor, active } = parseResult.data;

      // Gate checks if activating
      if (active) {
        const security = await storage.getSecuritySettings(userId);
        const kycApplicant = await storage.getKycApplicant(userId);
        
        // Check consent
        if (!security?.consentAccepted) {
          return res.status(403).json({ 
            error: "Consent required",
            code: "CONSENT_REQUIRED",
            message: "Please accept the terms and conditions before enabling payouts"
          });
        }
        
        // Check KYC
        if (kycApplicant?.status !== "APPROVED") {
          return res.status(403).json({ 
            error: "KYC required",
            code: "KYC_REQUIRED",
            message: "Please complete identity verification before enabling payouts"
          });
        }
        
        // Check address is provided
        if (!addressId) {
          return res.status(400).json({ 
            error: "Address required",
            code: "ADDRESS_REQUIRED",
            message: "Please select a whitelisted address before enabling payouts"
          });
        }
        
        // Check address is ACTIVE
        const address = await storage.getWhitelistAddress(addressId);
        if (!address || address.status !== "active") {
          return res.status(400).json({ 
            error: "Address not active",
            code: "ADDRESS_NOT_ACTIVE",
            message: "Selected address is not active. Please add and activate a whitelisted address first."
          });
        }
      }

      // Get strategy name for operation record
      const strategy = await storage.getStrategy(strategyId);

      const instruction = await storage.upsertPayoutInstruction({
        userId,
        strategyId,
        frequency,
        addressId: addressId || null,
        minPayoutMinor,
        active,
      });

      // Create operation for audit trail
      await storage.createOperation({
        userId,
        type: "PAYOUT_SETTINGS_CHANGED",
        status: "completed",
        asset: "USDT",
        amount: "0",
        fee: "0",
        txHash: null,
        providerRef: null,
        strategyId,
        strategyName: strategy?.name || null,
        fromVault: null,
        toVault: null,
        metadata: {
          frequency,
          active,
          minPayoutMinor,
          addressId: addressId || null,
        },
        reason: null,
      });

      res.json(instruction);
    } catch (error) {
      console.error("Save payout instruction error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== RISK CONTROL ROUTES ====================

  // GET /api/positions/:strategyId/risk-controls (protected)
  app.get("/api/positions/:strategyId/risk-controls", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { strategyId } = req.params;

      const position = await storage.getPosition(userId, strategyId);
      if (!position) {
        return res.json({
          paused: false,
          ddLimitPct: 0,
          autoPauseEnabled: false,
          pausedAt: null,
          pausedReason: null,
          hasPosition: false,
        });
      }

      // Calculate current drawdown
      const principal = BigInt(position.principalMinor || "0");
      const current = BigInt(position.investedCurrentMinor || "0");
      let currentDrawdownPct = 0;
      if (principal > 0n && principal > current) {
        currentDrawdownPct = Number(((principal - current) * 100n) / principal);
      }

      res.json({
        paused: position.paused,
        ddLimitPct: position.ddLimitPct,
        autoPauseEnabled: position.autoPauseEnabled,
        pausedAt: position.pausedAt?.toISOString() || null,
        pausedReason: position.pausedReason,
        hasPosition: true,
        currentDrawdownPct,
      });
    } catch (error) {
      console.error("Get risk controls error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/positions/:strategyId/risk-controls (protected)
  app.post("/api/positions/:strategyId/risk-controls", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { strategyId } = req.params;

      const schema = z.object({
        ddLimitPct: z.number().int().min(0).max(100).optional(),
        autoPauseEnabled: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { ddLimitPct, autoPauseEnabled } = parsed.data;

      const position = await storage.getPosition(userId, strategyId);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }

      const updates: Partial<typeof position> = {};
      if (ddLimitPct !== undefined) updates.ddLimitPct = ddLimitPct;
      if (autoPauseEnabled !== undefined) updates.autoPauseEnabled = autoPauseEnabled;

      const updated = await storage.updatePosition(position.id, updates);

      // Audit log
      await storage.createAuditLog({
        userId,
        event: "RISK_CONTROLS_UPDATED",
        resourceType: "position",
        resourceId: position.id,
        details: { strategyId, ddLimitPct, autoPauseEnabled },
      });

      res.json({ success: true, position: updated });
    } catch (error) {
      console.error("Update risk controls error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/positions/:strategyId/pause (protected)
  app.post("/api/positions/:strategyId/pause", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { strategyId } = req.params;

      const schema = z.object({
        paused: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { paused } = parsed.data;

      const position = await storage.getPosition(userId, strategyId);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }

      const updates: Partial<typeof position> = {
        paused,
        pausedAt: paused ? new Date() : null,
        pausedReason: paused ? "manual" : null,
      };

      const updated = await storage.updatePosition(position.id, updates);

      // Audit log
      await storage.createAuditLog({
        userId,
        event: paused ? "STRATEGY_PAUSED" : "STRATEGY_RESUMED",
        resourceType: "position",
        resourceId: position.id,
        details: { strategyId, reason: "manual" },
      });

      const strategy = await storage.getStrategy(strategyId);
      res.json({ 
        success: true, 
        position: updated,
        message: paused 
          ? `${strategy?.name || "Strategy"} has been paused`
          : `${strategy?.name || "Strategy"} has been resumed`
      });
    } catch (error) {
      console.error("Pause position error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== REDEMPTION ROUTES ====================

  // Helper function to calculate next weekly window (Sunday 00:00 UTC)
  function getNextWeeklyWindow(): Date {
    const now = new Date();
    const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7; // next Sunday
    const nextSunday = new Date(now);
    nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
    nextSunday.setUTCHours(0, 0, 0, 0);
    return nextSunday;
  }

  // GET /api/redemptions (protected)
  app.get("/api/redemptions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const strategyId = req.query.strategyId as string | undefined;
      const requests = await storage.getRedemptionRequests(userId, strategyId);
      res.json({
        requests: requests.map(r => ({
          id: r.id,
          strategyId: r.strategyId,
          amountMinor: r.amountMinor,
          requestedAt: r.requestedAt?.toISOString(),
          executeAt: r.executeAt?.toISOString(),
          status: r.status,
          executedAmountMinor: r.executedAmountMinor,
        })),
        nextWindow: getNextWeeklyWindow().toISOString(),
      });
    } catch (error) {
      console.error("Get redemptions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/redemptions (protected)
  app.post("/api/redemptions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        strategyId: z.string(),
        amountMinor: z.string().optional(), // null = ALL
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request", details: parseResult.error.issues });
      }

      const { strategyId, amountMinor } = parseResult.data;

      // Check position exists
      const position = await storage.getPosition(userId, strategyId);
      if (!position) {
        return res.status(400).json({ error: "No position found for this strategy" });
      }

      const principalMinor = BigInt(position.principalMinor || position.principal || "0");
      if (principalMinor <= 0n) {
        return res.status(400).json({ error: "No principal to redeem" });
      }

      // Validate amount if specified
      if (amountMinor) {
        const requestedAmount = BigInt(amountMinor);
        if (requestedAmount <= 0n) {
          return res.status(400).json({ error: "Amount must be positive" });
        }
        if (requestedAmount > principalMinor) {
          return res.status(400).json({ 
            error: "Insufficient principal", 
            available: principalMinor.toString(),
            requested: amountMinor 
          });
        }
      }

      const executeAt = getNextWeeklyWindow();
      
      const request = await storage.createRedemptionRequest({
        userId,
        strategyId,
        amountMinor: amountMinor || null,
        executeAt,
        status: "PENDING",
      });

      res.json({
        id: request.id,
        strategyId: request.strategyId,
        amountMinor: request.amountMinor,
        executeAt: executeAt.toISOString(),
        status: request.status,
      });
    } catch (error) {
      console.error("Create redemption error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== JOB ROUTES (DEV TRIGGERS) ====================

  // POST /api/jobs/accrue-daily - Apply daily strategy returns to positions (dev only)
  app.post("/api/jobs/accrue-daily", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const positions = await storage.getAllPositions();
      const results: Array<{ positionId: string; accrued: string; status: string; ddBreached?: boolean }> = [];

      for (const position of positions) {
        // Skip paused positions from accrual
        if (position.paused) {
          results.push({ positionId: position.id, accrued: "0", status: "paused" });
          continue;
        }

        // Skip if already accrued today
        if (position.lastAccrualDate === today) {
          results.push({ positionId: position.id, accrued: "0", status: "already_processed" });
          continue;
        }

        const invested = BigInt(position.investedCurrentMinor || position.currentValue || "0");
        if (invested <= 0n) {
          results.push({ positionId: position.id, accrued: "0", status: "no_investment" });
          continue;
        }

        // Get strategy for return calculation (demo: use expected range)
        const strategy = await storage.getStrategy(position.strategyId);
        if (!strategy) {
          results.push({ positionId: position.id, accrued: "0", status: "strategy_not_found" });
          continue;
        }

        // Demo: calculate daily return based on monthly range (divide by 30)
        const monthlyBps = (strategy.expectedMonthlyRangeBpsMin || 300) + 
          Math.floor(Math.random() * ((strategy.expectedMonthlyRangeBpsMax || 500) - (strategy.expectedMonthlyRangeBpsMin || 300)));
        const dailyBps = Math.round(monthlyBps / 30);
        
        // Apply return (can be negative for HIGH risk strategies occasionally)
        const isNegativeDay = strategy.riskTier === "HIGH" && Math.random() < 0.1;
        const effectiveBps = isNegativeDay ? -dailyBps : dailyBps;
        
        const profitMinor = (invested * BigInt(effectiveBps)) / 10000n;
        const newInvested = invested + profitMinor;
        
        // Accrued profit payable only increases for positive returns
        const currentAccrued = BigInt(position.accruedProfitPayableMinor || "0");
        const newAccrued = profitMinor > 0n ? currentAccrued + profitMinor : currentAccrued;

        // Check for drawdown breach (if auto-pause enabled with DD limit)
        let ddBreached = false;
        const principal = BigInt(position.principalMinor || "0");
        if (position.autoPauseEnabled && position.ddLimitPct > 0 && principal > 0n) {
          // Calculate drawdown: (principal - current) / principal * 100
          const drawdownPct = principal > newInvested 
            ? Number(((principal - newInvested) * 100n) / principal)
            : 0;
          
          if (drawdownPct >= position.ddLimitPct) {
            ddBreached = true;
            
            // Auto-pause the position
            await storage.updatePosition(position.id, {
              investedCurrentMinor: newInvested.toString(),
              accruedProfitPayableMinor: newAccrued.toString(),
              currentValue: newInvested.toString(),
              lastAccrualDate: today,
              paused: true,
              pausedAt: new Date(),
              pausedReason: "dd_breach",
            });

            // Create audit log
            await storage.createAuditLog({
              userId: position.userId,
              event: "DD_BREACH_AUTO_PAUSE",
              resourceType: "position",
              resourceId: position.id,
              details: { 
                strategyId: position.strategyId,
                strategyName: strategy.name,
                ddLimitPct: position.ddLimitPct,
                actualDrawdownPct: drawdownPct,
                principal: principal.toString(),
                currentValue: newInvested.toString(),
              },
            });

            // Create notification
            await storage.createNotification({
              userId: position.userId,
              type: "security",
              title: "Strategy Auto-Paused",
              message: `Your ${strategy.name} position was automatically paused due to a ${drawdownPct.toFixed(1)}% drawdown (limit: ${position.ddLimitPct}%).`,
              resourceType: "position",
              resourceId: position.id,
            });

            results.push({ 
              positionId: position.id, 
              accrued: profitMinor.toString(), 
              status: "dd_breach_paused",
              ddBreached: true,
            });
            continue;
          }
        }

        await storage.updatePosition(position.id, {
          investedCurrentMinor: newInvested.toString(),
          accruedProfitPayableMinor: newAccrued.toString(),
          currentValue: newInvested.toString(), // Keep legacy field in sync
          lastAccrualDate: today,
        });

        // Create PROFIT_ACCRUAL operation
        await storage.createOperation({
          userId: position.userId,
          type: "PROFIT_ACCRUAL",
          status: "completed",
          asset: "USDT",
          amount: profitMinor.toString(),
          strategyId: position.strategyId,
          strategyName: strategy.name,
          metadata: { dailyBps: effectiveBps, date: today },
        });

        results.push({ 
          positionId: position.id, 
          accrued: profitMinor.toString(), 
          status: "processed" 
        });
      }

      res.json({ success: true, date: today, results });
    } catch (error) {
      console.error("Accrue daily error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/jobs/payout-run - Execute profit payouts (dev only)
  app.post("/api/jobs/payout-run", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const frequency = (req.query.frequency as string) || "DAILY";
      
      const instructions = await storage.getActivePayoutInstructionsByFrequency(frequency);
      const results: Array<{ instructionId: string; status: string; netPayout?: string }> = [];

      for (const instruction of instructions) {
        // Get position
        const position = await storage.getPosition(instruction.userId, instruction.strategyId);
        if (!position) {
          results.push({ instructionId: instruction.id, status: "no_position" });
          continue;
        }

        const gross = BigInt(position.accruedProfitPayableMinor || "0");
        const networkFee = BigInt(NETWORK_FEE_MINOR);
        const minPayout = BigInt(instruction.minPayoutMinor);
        const net = gross - networkFee;

        if (net < minPayout) {
          results.push({ instructionId: instruction.id, status: "below_minimum", netPayout: net.toString() });
          continue;
        }

        // Verify address is still active
        if (!instruction.addressId) {
          results.push({ instructionId: instruction.id, status: "no_address" });
          continue;
        }

        const address = await storage.getWhitelistAddress(instruction.addressId);
        if (!address || address.status !== "active") {
          results.push({ instructionId: instruction.id, status: "address_not_active" });
          continue;
        }

        // Get strategy for operation
        const strategy = await storage.getStrategy(instruction.strategyId);

        // Create PROFIT_PAYOUT operation
        const txHash = `demo_tx_${randomUUID().slice(0, 8)}`;
        await storage.createOperation({
          userId: instruction.userId,
          type: "PROFIT_PAYOUT",
          status: "completed",
          asset: "USDT",
          amount: net.toString(),
          fee: NETWORK_FEE_MINOR,
          txHash,
          strategyId: instruction.strategyId,
          strategyName: strategy?.name,
          metadata: { 
            frequency, 
            addressId: instruction.addressId, 
            address: address.address,
            gross: gross.toString(),
            networkFee: NETWORK_FEE_MINOR,
          },
        });

        // Decrease accrued profit
        await storage.updatePosition(position.id, {
          accruedProfitPayableMinor: "0", // Reset after payout
        });

        // =================== AUTO-SWEEP LOGIC ===================
        // Only sweep if net payout is positive
        if (net > 0n) {
          const userSecurity = await storage.getSecuritySettings(instruction.userId);
          if (userSecurity?.autoSweepEnabled) {
            const userVaults = await storage.getVaults(instruction.userId);
            const sweepVaults = userVaults.filter(v => v.autoSweepEnabled && (v.autoSweepPct ?? 0) > 0);
            
            // Track remaining amount to prevent over-sweeping
            let remainingToSweep = net;
            
            for (const vault of sweepVaults) {
              if (remainingToSweep <= 0n) break;
              
              const pct = vault.autoSweepPct ?? 0;
              // Calculate sweep amount, capped at remaining
              const calculated = (net * BigInt(pct)) / 100n;
              const sweepAmount = calculated < remainingToSweep ? calculated : remainingToSweep;
              if (sweepAmount <= 0n) continue;
              
              remainingToSweep -= sweepAmount;
              
              // Create operation FIRST for auditability
              const sweepOp = await storage.createOperation({
                userId: instruction.userId,
                type: "VAULT_TRANSFER",
                status: "completed",
                asset: "USDT",
                amount: sweepAmount.toString(),
                fee: "0",
                fromVault: "wallet",
                toVault: vault.type,
                metadata: { 
                  trigger: "auto_sweep", 
                  sourceOperation: "PROFIT_PAYOUT",
                  percentage: pct,
                  sourceAmount: net.toString(),
                },
                reason: `Auto-sweep ${pct}% of profit to ${vault.type} vault`,
              });
              
              // Update vault balance
              const newBalance = (BigInt(vault.balance) + sweepAmount).toString();
              await storage.updateVault(instruction.userId, vault.type, newBalance);
              
              // Create audit log
              await storage.createAuditLog({
                userId: instruction.userId,
                event: "AUTO_SWEEP_EXECUTED",
                resourceType: "vault",
                resourceId: vault.id,
                details: {
                  vaultType: vault.type,
                  percentage: pct,
                  sweepAmount: sweepAmount.toString(),
                  profitAmount: net.toString(),
                  newVaultBalance: newBalance,
                  operationId: sweepOp.id,
                },
              });
              
              // Create notification
              await storage.createNotification({
                userId: instruction.userId,
                type: "system",
                title: "Auto-Sweep Executed",
                message: `${pct}% of your profit (${formatMoney(sweepAmount.toString(), "USDT")} USDT) was swept to ${vault.type} vault`,
                resourceType: "vault",
                resourceId: vault.id,
              });
            }
          }
        }
        // ========================================================

        results.push({ instructionId: instruction.id, status: "paid", netPayout: net.toString() });
      }

      res.json({ success: true, frequency, results });
    } catch (error) {
      console.error("Payout run error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/jobs/redemption-weekly-run - Execute due redemption requests (dev only)
  app.post("/api/jobs/redemption-weekly-run", devOnlyGuard, isAuthenticated, async (req, res) => {
    try {
      const dueRequests = await storage.getPendingRedemptionsDue();
      const results: Array<{ requestId: string; status: string; amount?: string }> = [];

      for (const request of dueRequests) {
        const position = await storage.getPosition(request.userId, request.strategyId);
        if (!position) {
          await storage.updateRedemptionRequest(request.id, { status: "CANCELLED" });
          results.push({ requestId: request.id, status: "cancelled_no_position" });
          continue;
        }

        const principalAvailable = BigInt(position.principalMinor || position.principal || "0");
        const investedCurrent = BigInt(position.investedCurrentMinor || position.currentValue || "0");
        
        // Determine amount to redeem
        let redeemAmount: bigint;
        if (!request.amountMinor) {
          // Redeem ALL
          redeemAmount = principalAvailable;
        } else {
          redeemAmount = BigInt(request.amountMinor);
          if (redeemAmount > principalAvailable) {
            redeemAmount = principalAvailable; // Cap at available
          }
        }

        if (redeemAmount <= 0n) {
          await storage.updateRedemptionRequest(request.id, { status: "CANCELLED" });
          results.push({ requestId: request.id, status: "cancelled_no_principal" });
          continue;
        }

        // Calculate proportional reduction in invested current
        const ratio = principalAvailable > 0n ? 
          (redeemAmount * 10000n) / principalAvailable : 10000n;
        const investedReduction = (investedCurrent * ratio) / 10000n;

        // Update position
        await storage.updatePosition(position.id, {
          principalMinor: (principalAvailable - redeemAmount).toString(),
          investedCurrentMinor: (investedCurrent - investedReduction).toString(),
          principal: (principalAvailable - redeemAmount).toString(),
          currentValue: (investedCurrent - investedReduction).toString(),
        });

        // Credit to wallet
        const balance = await storage.getBalance(request.userId, "USDT");
        const currentAvailable = BigInt(balance?.available || "0");
        await storage.updateBalance(request.userId, "USDT", 
          (currentAvailable + redeemAmount).toString(),
          balance?.locked || "0"
        );

        // Get strategy for operation
        const strategy = await storage.getStrategy(request.strategyId);

        // Create operation
        await storage.createOperation({
          userId: request.userId,
          type: "PRINCIPAL_REDEEM_EXECUTED",
          status: "completed",
          asset: "USDT",
          amount: redeemAmount.toString(),
          strategyId: request.strategyId,
          strategyName: strategy?.name,
          metadata: { redemptionRequestId: request.id },
        });

        // Update redemption request
        await storage.updateRedemptionRequest(request.id, {
          status: "EXECUTED",
          executedAmountMinor: redeemAmount.toString(),
        });

        results.push({ requestId: request.id, status: "executed", amount: redeemAmount.toString() });
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error("Redemption weekly run error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== STATUS PAGE ====================
  
  // System status configuration (can be overridden via env vars)
  const getSystemStatus = () => {
    const overall = (process.env.SYSTEM_STATUS || "operational") as "operational" | "degraded" | "maintenance";
    const message = process.env.SYSTEM_STATUS_MESSAGE || null;
    
    // Component statuses (can be extended with real health checks)
    const components = [
      { 
        id: "deposits",
        name: "Deposits", 
        status: (process.env.STATUS_DEPOSITS || "operational") as "operational" | "degraded" | "outage",
        description: "USDT and card deposits"
      },
      { 
        id: "withdrawals",
        name: "Withdrawals", 
        status: (process.env.STATUS_WITHDRAWALS || "operational") as "operational" | "degraded" | "outage",
        description: "USDT withdrawals to external wallets"
      },
      { 
        id: "strategies",
        name: "Investment Strategies", 
        status: (process.env.STATUS_STRATEGIES || "operational") as "operational" | "degraded" | "outage",
        description: "Strategy investments and profit accrual"
      },
      { 
        id: "api",
        name: "API Services", 
        status: (process.env.STATUS_API || "operational") as "operational" | "degraded" | "outage",
        description: "Core platform services"
      },
    ];
    
    return {
      overall,
      message,
      components,
      updatedAt: new Date().toISOString(),
    };
  };

  // GET /api/status - Public system status endpoint
  app.get("/api/status", (_req, res) => {
    const status = getSystemStatus();
    res.json(status);
  });

  // ==================== STRATEGY PROFILES ====================

  const PROFILE_ORDER = [
    "btc_squeeze_breakout",
    "eth_ema_revert", 
    "bnb_trend_pullback",
    "sol_vol_burst",
    "xrp_keltner_revert",
    "doge_fast_momo",
    "ada_deep_revert",
    "trx_lowvol_band",
  ];

  const SIM_TIMEFRAME_MS: Record<string, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  const MAX_CANDLES = 50000;
  const MIN_SPEED = 1;
  const MAX_SPEED = 200;

  // GET /api/strategy-profiles - List enabled profiles with stable ordering
  app.get("/api/strategy-profiles", async (_req, res) => {
    try {
      const profiles = await storage.getStrategyProfiles();
      const sorted = profiles.sort((a, b) => {
        const aIdx = PROFILE_ORDER.indexOf(a.slug);
        const bIdx = PROFILE_ORDER.indexOf(b.slug);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });
      res.json({ profiles: sorted });
    } catch (error) {
      console.error("Get strategy profiles error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // GET /api/strategy-profiles/:slug - Profile detail with defaultConfig and configSchema
  app.get("/api/strategy-profiles/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const profile = await storage.getStrategyProfile(slug);
      if (!profile) {
        return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Strategy profile not found" } });
      }
      if (!profile.isEnabled) {
        return res.status(404).json({ error: { code: "PROFILE_DISABLED", message: "Strategy profile is disabled" } });
      }
      res.json({
        id: profile.id,
        slug: profile.slug,
        displayName: profile.displayName,
        symbol: profile.symbol,
        timeframe: profile.timeframe,
        description: profile.description,
        tags: profile.tags,
        riskLevel: profile.riskLevel,
        defaultConfig: profile.defaultConfig,
        configSchema: profile.configSchema,
      });
    } catch (error) {
      console.error("Get strategy profile error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // ==================== MARKET DATA ====================

  // GET /api/market/candles - Get candles for a symbol (with backfill if needed)
  app.get("/api/market/candles", isAuthenticated, async (req, res) => {
    try {
      const { symbol, timeframe, startMs, endMs, limit, exchange = "cryptocompare" } = req.query;
      
      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({ error: "symbol is required" });
      }
      if (!timeframe || typeof timeframe !== "string") {
        return res.status(400).json({ error: "timeframe is required (15m, 1h, 1d)" });
      }

      const normalizedTimeframe = normalizeTimeframe(timeframe);
      const tfMs = timeframeToMs(normalizedTimeframe);

      if (limit && !isNaN(Number(limit))) {
        const requestedLimit = Math.min(500, Math.max(10, Number(limit)));
        await ensureReplayClock();
        if (isSimEnabled()) {
          await marketSimService.ensureStarted();
        }
        const simNow = getSimNow();
        const currentStart = alignToGrid(simNow, tfMs);
        const rangeStart = currentStart - (requestedLimit - 1) * tfMs;
        const rangeEnd = currentStart + tfMs;

        const result = await loadCandles({
          exchange: exchange as string,
          symbol,
          timeframe: normalizedTimeframe,
          startMs: rangeStart,
          endMs: rangeEnd,
          maxBars: 5000,
        });

        let candles = result.candles.slice(-requestedLimit);

        const latestQuote = marketSimService.getLatestQuote(symbol);
        if (latestQuote) {
          const last = candles[candles.length - 1];
          if (last && last.ts === currentStart) {
            const updated = {
              ...last,
              close: latestQuote.price,
              high: Math.max(last.high, latestQuote.price),
              low: Math.min(last.low, latestQuote.price),
            };
            candles = [...candles.slice(0, -1), updated];
          } else {
            candles = [
              ...candles,
              {
                ts: currentStart,
                open: latestQuote.price,
                high: latestQuote.price,
                low: latestQuote.price,
                close: latestQuote.price,
                volume: 0,
              },
            ].slice(-requestedLimit);
          }
        }

        return res.json({
          success: true,
          data: {
            candles,
            gaps: result.gaps,
            source: result.source,
            count: candles.length,
            simNow,
          },
        });
      }

      if (!startMs || isNaN(Number(startMs))) {
        return res.status(400).json({ error: "startMs is required (unix ms)" });
      }
      if (!endMs || isNaN(Number(endMs))) {
        return res.status(400).json({ error: "endMs is required (unix ms)" });
      }
      
      const start = Number(startMs);
      const end = Number(endMs);
      
      if (start >= end) {
        return res.status(400).json({ error: "startMs must be less than endMs" });
      }
      
      const result = await loadCandles({
        exchange: exchange as string,
        symbol,
        timeframe: normalizedTimeframe,
        startMs: start,
        endMs: end,
        maxBars: 5000,
      });
      
      res.json({
        success: true,
        data: {
          candles: result.candles,
          gaps: result.gaps,
          source: result.source,
          count: result.candles.length,
        },
      });
    } catch (error) {
      console.error("Get candles error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      res.status(400).json({ error: message });
    }
  });

  // GET /api/market/quotes - Snapshot of latest simulated quotes
  app.get("/api/market/quotes", isAuthenticated, async (req, res) => {
    if (!isSimEnabled()) {
      return res.status(503).json({ error: "SIM_DISABLED" });
    }

    await marketSimService.ensureStarted();
    const symbolsParam = req.query.symbols as string | undefined;
    const symbols = symbolsParam
      ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : marketSimService.getSymbols();

    const quotes = marketSimService.getLatestQuotes(symbols);
    res.json({ quotes, simNow: getSimNow() });
  });

  // GET /api/market/stream - SSE stream of simulated quotes
  app.get("/api/market/stream", isAuthenticated, async (req, res) => {
    if (!isSimEnabled()) {
      return res.status(503).json({ error: "SIM_DISABLED" });
    }

    await marketSimService.ensureStarted();
    const symbolsParam = req.query.symbols as string | undefined;
    const requestedSymbols = symbolsParam
      ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : marketSimService.getSymbols();

    const symbolSet = new Set(requestedSymbols.map((s) => normalizeSymbol(s)));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendQuote = (quote: { symbol: string; ts: number; price: number }) => {
      if (symbolSet.has(quote.symbol)) {
        res.write(`event: quote\ndata: ${JSON.stringify(quote)}\n\n`);
      }
    };

    for (const quote of marketSimService.getLatestQuotes(Array.from(symbolSet))) {
      sendQuote(quote);
    }

    const heartbeatInterval = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);

    marketSimService.on("quote", sendQuote);

    const cleanup = () => {
      clearInterval(heartbeatInterval);
      marketSimService.off("quote", sendQuote);
      res.end();
    };

    req.on("close", cleanup);
  });

  // ==================== LIVE SESSIONS ====================

  const LIVE_SESSION_DEFAULT_SPEED = 10;
  const LIVE_WARMUP_BUFFER_BARS = 20;

  app.post("/api/live-sessions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

      if (idempotencyKey) {
        const existing = await storage.getSimSessionByIdempotencyKey(userId, idempotencyKey);
        if (existing) {
          return res.status(200).json({
            sessionId: existing.id,
            status: existing.status,
          });
        }
      }

      const schema = z.object({
        strategyId: z.string().min(1),
        symbols: z.array(z.string().min(1)).optional(),
        configOverride: z.record(z.unknown()).optional(),
        speed: z.number().int().min(1).max(50).optional(),
        startMs: z.number().int().positive().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.errors,
          },
        });
      }

      const { strategyId, symbols, configOverride, speed, startMs } = parsed.data;

      let profile = await storage.getStrategyProfile(strategyId);
      if (!profile) {
        profile = await storage.getStrategyProfileById(strategyId);
      }
      if (!profile) {
        return res.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Strategy profile not found" },
        });
      }

      const tfMs = SIM_TIMEFRAME_MS[profile.timeframe];
      if (!tfMs) {
        return res.status(400).json({
          error: { code: "INVALID_TIMEFRAME", message: `Unknown timeframe: ${profile.timeframe}` },
        });
      }

      await ensureReplayClock();
      const lagMs = getSimLagMs();
      const decisionNow = getDecisionNow(lagMs);

      const warmupBars = Math.max(
        (profile.defaultConfig as StrategyProfileConfig).minBarsWarmup || 200,
        100
      );

      const warmupStart = decisionNow - tfMs * (warmupBars + LIVE_WARMUP_BUFFER_BARS);
      const startBase = startMs ?? warmupStart;
      const alignedStart = alignToGrid(Math.min(startBase, warmupStart), tfMs);

      const symbol = normalizeSymbol(symbols && symbols.length > 0 ? symbols[0] : profile.symbol);

      const session = await storage.createSimSession({
        userId,
        profileSlug: profile.slug,
        symbol,
        timeframe: profile.timeframe,
        startMs: alignedStart,
        endMs: null,
        speed: speed ?? LIVE_SESSION_DEFAULT_SPEED,
        mode: "lagged_live",
        lagMs,
        replayMsPerCandle: 1000,
        configOverrides: configOverride as any,
        status: SimSessionStatus.CREATED,
        idempotencyKey,
      });

      res.status(201).json({
        sessionId: session.id,
        status: session.status,
      });
    } catch (error) {
      console.error("Create live session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  app.post("/api/live-sessions/:id/start", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionId = req.params.id;

      const session = await storage.getSimSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
      }
      if (session.userId !== userId) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      }

      if (sessionRunner.isRunning(sessionId)) {
        return res.status(200).json({ sessionId, status: session.status });
      }

      const profile = await storage.getStrategyProfile(session.profileSlug);
      if (!profile) {
        return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Strategy profile not found" } });
      }

      const startResult = await sessionRunner.startSession(session, profile.defaultConfig);
      if (!startResult.success) {
        await storage.updateSimSession(session.id, {
          status: SimSessionStatus.FAILED,
          errorMessage: startResult.error,
        });
        return res.status(400).json({
          error: { code: "START_FAILED", message: startResult.error },
        });
      }

      res.status(200).json({ sessionId, status: SimSessionStatus.RUNNING });
    } catch (error) {
      console.error("Start live session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  app.get("/api/live-sessions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionId = req.params.id;

      const session = await storage.getSimSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
      }
      if (session.userId !== userId) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      }

      const latestEquity = await storage.getLatestSimEventByType(sessionId, "equity");
      const tradeCount = await storage.getSimTradeCount(sessionId);

      res.json({
        id: session.id,
        status: session.status,
        profileSlug: session.profileSlug,
        timeframe: session.timeframe,
        symbols: [session.symbol],
        startMs: session.startMs,
        createdAt: session.createdAt,
        lastUpdate: latestEquity?.ts || session.updatedAt?.getTime() || session.createdAt?.getTime(),
        equity: (latestEquity?.payload as any)?.data?.equity ?? 10000,
        tradesCount: tradeCount,
        streamUrl: `/api/sim/sessions/${session.id}/stream`,
      });
    } catch (error) {
      console.error("Get live session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  app.post("/api/live-sessions/:id/control", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionId = req.params.id;

      const schema = z.object({
        action: z.enum(["pause", "resume", "stop"]),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid action",
            details: parsed.error.errors,
          },
        });
      }

      const session = await storage.getSimSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
      }
      if (session.userId !== userId) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      }

      const { action } = parsed.data;

      if (action === "pause") {
        if (session.status !== SimSessionStatus.RUNNING) {
          return res.status(400).json({ error: { code: "NOT_RUNNING", message: "Session is not running" } });
        }
        sessionRunner.pause(sessionId);
        return res.json({ sessionId, status: SimSessionStatus.PAUSED });
      }

      if (action === "resume") {
        if (session.status !== SimSessionStatus.PAUSED) {
          return res.status(400).json({ error: { code: "NOT_PAUSED", message: "Session is not paused" } });
        }
        sessionRunner.resume(sessionId);
        return res.json({ sessionId, status: SimSessionStatus.RUNNING });
      }

      sessionRunner.stop(sessionId);
      return res.json({ sessionId, status: SimSessionStatus.STOPPED });
    } catch (error) {
      console.error("Control live session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // ==================== SIMULATION SESSIONS ====================
  
  // Configure session runner callbacks for event persistence
  sessionRunner.setEventCallback(async (sessionId, event) => {
    await storage.insertSimEvent(sessionId, event.seq, event.ts, event.type, event.payload);
    await storage.updateSessionLastSeq(sessionId, event.seq);

    if (event.type === "trade") {
      const payload = event.payload as { data?: Record<string, unknown> } | null;
      const trade = payload?.data || {};
      const qty = typeof trade.qty === "number" ? trade.qty.toString() : "0";
      const priceValue =
        typeof trade.exitPrice === "number"
          ? trade.exitPrice
          : typeof trade.price === "number"
            ? trade.price
            : typeof trade.entryPrice === "number"
              ? trade.entryPrice
              : 0;

      await storage.insertSimTrade({
        sessionId,
        ts: event.ts,
        symbol: trade.symbol?.toString() || "UNKNOWN",
        side: trade.side?.toString() || "LONG",
        qty,
        price: priceValue.toString(),
        meta: trade,
      });
    }
  });

  sessionRunner.setStatusChangeCallback(async (sessionId, status, errorMessage) => {
    await storage.updateSimSession(sessionId, { status, errorMessage });
  });

  // POST /api/sim/sessions - Create a new simulation session with full validation
  app.post("/api/sim/sessions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      
      // Check idempotency via header
      if (idempotencyKey) {
        const existing = await storage.getSimSessionByIdempotencyKey(userId, idempotencyKey);
        if (existing) {
          return res.status(200).json({
            sessionId: existing.id,
            status: existing.status,
            streamUrl: `/api/sim/sessions/${existing.id}/stream`,
          });
        }
      }
      
      const schema = z.object({
        profileSlug: z.string().min(1),
        startMs: z.number().int().positive(),
        endMs: z.number().int().positive().optional(),
        speed: z.number().int().min(MIN_SPEED).max(MAX_SPEED).optional().default(1),
        mode: z.enum(["replay", "lagged_live"]).optional().default("replay"),
        lagMs: z.number().int().min(60000).max(3600000).optional().default(900000),
        replayMsPerCandle: z.number().int().min(100).max(60000).optional().default(15000),
        configOverride: z.record(z.unknown()).optional(),
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.errors,
          },
        });
      }
      
      const { profileSlug, startMs, endMs, speed, mode, lagMs, replayMsPerCandle, configOverride } = parsed.data;
      
      // Get profile by slug
      const profile = await storage.getStrategyProfile(profileSlug);
      if (!profile) {
        return res.status(404).json({
          error: { code: "PROFILE_NOT_FOUND", message: "Strategy profile not found" },
        });
      }
      if (!profile.isEnabled) {
        return res.status(400).json({
          error: { code: "PROFILE_DISABLED", message: "Strategy profile is disabled" },
        });
      }
      
      // For replay mode, endMs is required and must be > startMs
      if (mode === "replay") {
        if (!endMs) {
          return res.status(400).json({
            error: { code: "MISSING_END_MS", message: "endMs is required for replay mode" },
          });
        }
        if (startMs >= endMs) {
          return res.status(400).json({
            error: { code: "INVALID_TIME_RANGE", message: "startMs must be less than endMs" },
          });
        }
      }
      
      // Get timeframe ms
      const tfMs = SIM_TIMEFRAME_MS[profile.timeframe];
      if (!tfMs) {
        return res.status(400).json({
          error: { code: "INVALID_TIMEFRAME", message: `Unknown timeframe: ${profile.timeframe}` },
        });
      }
      
      // Validate alignment to timeframe grid
      if (startMs % tfMs !== 0) {
        return res.status(400).json({
          error: {
            code: "START_NOT_ALIGNED",
            message: `startMs must be aligned to ${profile.timeframe} grid (multiple of ${tfMs}ms)`,
          },
        });
      }
      if (endMs && endMs % tfMs !== 0) {
        return res.status(400).json({
          error: {
            code: "END_NOT_ALIGNED",
            message: `endMs must be aligned to ${profile.timeframe} grid (multiple of ${tfMs}ms)`,
          },
        });
      }
      
      // Validate max candles (only for replay mode with defined endMs)
      if (endMs) {
        const candleCount = (endMs - startMs) / tfMs;
        if (candleCount > MAX_CANDLES) {
          return res.status(400).json({
            error: {
              code: "RANGE_TOO_LARGE",
              message: `Range exceeds maximum ${MAX_CANDLES} candles (requested: ${candleCount})`,
            },
          });
        }
      }
      
      // For replay mode, pre-load candles and check for gaps
      if (mode === "replay" && endMs) {
        const candleResult = await loadCandles({
          symbol: profile.symbol,
          timeframe: profile.timeframe as Timeframe,
          startMs,
          endMs,
        });
        
        if (candleResult.gaps && candleResult.gaps.length > 0) {
          return res.status(422).json({
            error: {
              code: "MARKET_DATA_GAPS",
              message: "Market data has gaps in the requested range",
              gaps: candleResult.gaps,
            },
          });
        }
      }
      
      // Create session
      const session = await storage.createSimSession({
        userId,
        profileSlug,
        symbol: profile.symbol,
        timeframe: profile.timeframe,
        startMs,
        endMs: endMs ?? null,
        speed,
        mode,
        lagMs,
        replayMsPerCandle,
        configOverrides: configOverride as any,
        status: SimSessionStatus.CREATED,
        idempotencyKey,
      });
      
      // Auto-start the session
      const startResult = await sessionRunner.startSession(session, profile.defaultConfig);
      if (!startResult.success) {
        await storage.updateSimSession(session.id, { 
          status: SimSessionStatus.FAILED, 
          errorMessage: startResult.error,
        });
        return res.status(400).json({
          error: { code: "START_FAILED", message: startResult.error },
        });
      }
      
      res.status(201).json({
        sessionId: session.id,
        status: SimSessionStatus.RUNNING,
        streamUrl: `/api/sim/sessions/${session.id}/stream`,
      });
    } catch (error) {
      console.error("Create sim session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // GET /api/sim/sessions - List user's simulation sessions
  app.get("/api/sim/sessions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const status = req.query.status as string | undefined;
      
      const sessions = await storage.getSimSessionsByUser(userId, status);
      res.json({ sessions });
    } catch (error) {
      console.error("Get sim sessions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/sim/sessions/:id - Get a specific session with metadata
  app.get("/api/sim/sessions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionId = req.params.id;
      
      const session = await storage.getSimSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
      }
      if (session.userId !== userId) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      }
      
      const runnerState = sessionRunner.getState(sessionId);
      
      res.json({
        id: session.id,
        profileSlug: session.profileSlug,
        symbol: session.symbol,
        timeframe: session.timeframe,
        startMs: session.startMs,
        endMs: session.endMs,
        speed: session.speed,
        status: session.status,
        lastSeq: session.lastSeq,
        errorMessage: session.errorMessage,
        configOverrides: session.configOverrides,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        progress: runnerState ? {
          candleIndex: runnerState.candleIndex,
          totalCandles: runnerState.totalCandles,
          pct: Math.round((runnerState.candleIndex / runnerState.totalCandles) * 100),
        } : null,
        streamUrl: `/api/sim/sessions/${session.id}/stream`,
      });
    } catch (error) {
      console.error("Get sim session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // GET /api/sim/sessions/:id/events - Get session events with pagination
  app.get("/api/sim/sessions/:id/events", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionId = req.params.id;
      const fromSeq = req.query.fromSeq ? parseInt(req.query.fromSeq as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      
      const session = await storage.getSimSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      if (session.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const events = await storage.getSimEvents(sessionId, fromSeq, limit);
      res.json({ events, lastSeq: session.lastSeq });
    } catch (error) {
      console.error("Get sim events error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/sim/sessions/:id/control - Control session (pause/resume/stop)
  app.post("/api/sim/sessions/:id/control", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const sessionId = req.params.id;
      
      const schema = z.object({
        action: z.enum(["pause", "resume", "stop"]),
      });
      
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid action",
            details: parsed.error.errors,
          },
        });
      }
      
      const { action } = parsed.data;
      
      const session = await storage.getSimSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
      }
      if (session.userId !== userId) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      }
      
      if (action === "pause") {
        if (session.status !== SimSessionStatus.RUNNING) {
          return res.status(400).json({ error: { code: "NOT_RUNNING", message: "Session is not running" } });
        }
        sessionRunner.pause(sessionId);
        res.json({ sessionId, status: SimSessionStatus.PAUSED });
        
      } else if (action === "resume") {
        if (session.status !== SimSessionStatus.PAUSED) {
          return res.status(400).json({ error: { code: "NOT_PAUSED", message: "Session is not paused" } });
        }
        sessionRunner.resume(sessionId);
        res.json({ sessionId, status: SimSessionStatus.RUNNING });
        
      } else if (action === "stop") {
        sessionRunner.stop(sessionId);
        res.json({ sessionId, status: SimSessionStatus.STOPPED });
      }
    } catch (error) {
      console.error("Control sim session error:", error);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  });

  // GET /api/sim/sessions/:id/stream - SSE endpoint for real-time events
  app.get("/api/sim/sessions/:id/stream", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const sessionId = req.params.id;
    const fromSeq = req.query.fromSeq ? parseInt(req.query.fromSeq as string, 10) : 0;
    
    const session = await storage.getSimSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    
    const sendEnvelope = (payload: { seq: number; ts: number; type: string; payload: unknown }) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Send heartbeat
    const sendHeartbeat = () => {
      res.write(": heartbeat\n\n");
    };
    const heartbeatInterval = setInterval(sendHeartbeat, 15000);
    
    // Track current sequence
    let currentSeq = fromSeq;
    
    // First, send any missed events from DB
    const missedEvents = await storage.getSimEvents(sessionId, fromSeq, 1000);
    for (const event of missedEvents) {
      sendEnvelope({ seq: event.seq, ts: event.ts, type: event.type, payload: event.payload });
      currentSeq = event.seq + 1;
    }
    
    // Subscribe to live events from the session runner
    const isActive = sessionRunner.isRunning(sessionId);
    
    if (isActive) {
      const eventHandler = (_sid: string, event: { seq: number; ts: number; type: string; payload: unknown }) => {
        if (event.seq >= currentSeq) {
          sendEnvelope({ seq: event.seq, ts: event.ts, type: event.type, payload: event.payload });
          currentSeq = event.seq + 1;
        }
      };
      
      const statusHandler = (_sid: string, status: string) => {
        sendEnvelope({ seq: currentSeq, ts: Date.now(), type: "status", payload: { status } });
        if (status === SimSessionStatus.FINISHED || 
            status === SimSessionStatus.FAILED || 
            status === SimSessionStatus.STOPPED) {
          cleanup();
        }
      };
      
      // Listen to emitter events (filtered by sessionId)
      const wrappedEventHandler = (sid: string, event: { seq: number; ts: number; type: string; payload: unknown }) => {
        if (sid === sessionId) eventHandler(sid, event);
      };
      const wrappedStatusHandler = (sid: string, status: string) => {
        if (sid === sessionId) statusHandler(sid, status);
      };
      
      sessionRunner.on("event", wrappedEventHandler);
      sessionRunner.on("statusChange", wrappedStatusHandler);
      
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        sessionRunner.off("event", wrappedEventHandler);
        sessionRunner.off("statusChange", wrappedStatusHandler);
        res.end();
      };
      
      req.on("close", cleanup);
    } else {
      // No active runner - just send current status and close
      sendEnvelope({ seq: currentSeq, ts: Date.now(), type: "status", payload: { status: session.status } });
      clearInterval(heartbeatInterval);
      res.end();
    }
  });

  return httpServer;
}
