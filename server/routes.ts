import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { randomUUID } from "crypto";
import { formatMoney, VALID_TIMEFRAMES, type Timeframe, AddressStatus } from "@shared/schema";
import { registerExtractedRoutes } from "./routes/index";
import { loadCandles } from "./marketData/loadCandles";

import { db, withTransaction, type DbTransaction } from "./db";
import { sql, eq, and } from "drizzle-orm";
import { balances, vaults, positions, operations, auditLogs, withdrawals } from "@shared/schema";

// Invariant check: no negative balance
function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`INVARIANT_VIOLATION: ${label} cannot be negative (got ${value})`);
  }
}
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";
import { adminRouter } from "./admin/router";
import { requireTwoFactor } from "./middleware/requireTwoFactor";

// Production guard for dev/test endpoints
const isProduction = process.env.NODE_ENV === "production";
function devOnly(_req: Request, res: Response, next: NextFunction) {
  if (isProduction) {
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

// Common amount schema: digits only, must be > 0
const amountSchema = z.string()
  .regex(/^\d+$/, "Amount must contain only digits")
  .refine((val) => BigInt(val) > 0n, "Amount must be greater than zero");

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
  const { KycTransitions, KycStatus, KycStatusToSecurityStatus } = await import("@shared/schema");

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

  // Sync securitySettings.kycStatus
  await storage.updateSecuritySettings(userId, { 
    kycStatus: KycStatusToSecurityStatus["IN_REVIEW"] 
  });

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

  // Demo mode: auto-approve after 2 seconds
  setTimeout(async () => {
    try {
      const currentApplicant = await storage.getKycApplicant(userId);
      if (currentApplicant?.status === "IN_REVIEW") {
        await storage.updateKycApplicant(userId, {
          status: "APPROVED",
          reviewedAt: new Date(),
        });
        await storage.updateSecuritySettings(userId, { 
          kycStatus: KycStatusToSecurityStatus["APPROVED"] 
        });

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

  return {
    httpStatus: 200,
    success: true,
    status: "IN_REVIEW",
    message: "KYC verification started. Demo mode will auto-approve in ~2 seconds.",
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

  // Mount Admin API router
  app.use("/api/admin", adminRouter);

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
      const hasActiveWhitelistAddress = whitelistAddresses.some((a) => a.status === AddressStatus.ACTIVE);
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

      // Import mapping for fallback normalization
      const { KycStatusToSecurityStatus } = await import("@shared/schema");
      
      // Fallback normalization: derive kycStatus from kycApplicant if securitySettings is out of sync
      // This ensures UI always sees consistent lowercase status values
      // Priority: 1) kycApplicant status (mapped to lowercase), 2) securitySettings (normalized), 3) default
      const normalizeLegacyStatus = (status: string | null | undefined): string => {
        if (!status) return "not_started";
        // Handle legacy "pending" value by mapping to "not_started"
        if (status === "pending") return "not_started";
        return status;
      };
      
      const normalizedKycStatus = kycApplicant 
        ? KycStatusToSecurityStatus[kycApplicantStatus as keyof typeof KycStatusToSecurityStatus] || "not_started"
        : normalizeLegacyStatus(security?.kycStatus);

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
        security: {
          ...security,
          consentAccepted: security?.consentAccepted ?? false,
          kycStatus: normalizedKycStatus, // Use normalized status from kycApplicant
          twoFactorEnabled: security?.twoFactorEnabled ?? false,
          antiPhishingCode: security?.antiPhishingCode ?? null,
          whitelistEnabled: security?.whitelistEnabled ?? false,
          addressDelay: security?.addressDelay ?? 0,
          autoSweepEnabled: security?.autoSweepEnabled ?? false,
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

  // ─────────────────────────────────────────────────────────────────────────────
  // EXTRACTED ROUTES (strategies, operations, statements, security, notifications)
  // ─────────────────────────────────────────────────────────────────────────────
  registerExtractedRoutes({ app, isAuthenticated, devOnly, getUserId });

  // ─────────────────────────────────────────────────────────────────────────────
  // MARKET DATA
  // ─────────────────────────────────────────────────────────────────────────────

  const MAX_CANDLES_PER_REQUEST = 35040; // ~1 year of 15m candles

  const TIMEFRAME_MS: Record<Timeframe, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };

  // GET /api/market/candles
  app.get("/api/market/candles", async (req, res) => {
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

      // Validate max candles
      const candleCount = (endMs - startMs) / tfMs;
      if (candleCount > MAX_CANDLES_PER_REQUEST) {
        return res.status(413).json({
          error: {
            code: "TOO_MANY_CANDLES",
            message: `Requested ${candleCount} candles exceeds limit of ${MAX_CANDLES_PER_REQUEST}`,
            details: { requested: candleCount, limit: MAX_CANDLES_PER_REQUEST },
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

  // NOTE: Operations routes moved to server/routes/operations.ts

  // NOTE: Statements routes moved to server/routes/statements.ts

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
  app.post("/api/deposit/usdt/simulate", isAuthenticated, devOnly, async (req, res) => {
    const userId = getUserId(req);
    const endpoint = "/api/deposit/usdt/simulate";
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;
    
    try {
      // Acquire idempotency lock (atomic)
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
        // No idempotency key provided, continue normally
      }

      const schema = z.object({ amount: amountSchema });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const { amount } = parsed.data;

      // Validate minimum deposit
      if (BigInt(amount) < BigInt(MIN_DEPOSIT_MINOR)) {
        const errorBody = { error: "Amount below minimum deposit", code: "MIN_DEPOSIT", minimum: MIN_DEPOSIT_MINOR };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

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
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });

  // POST /api/deposit/card/simulate (protected, idempotent, dev only)
  app.post("/api/deposit/card/simulate", isAuthenticated, devOnly, async (req, res) => {
    const userId = getUserId(req);
    const endpoint = "/api/deposit/card/simulate";
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;
    
    try {
      // Acquire idempotency lock (atomic)
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({ amount: amountSchema }); // RUB in kopeks
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
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
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });

  // POST /api/invest (protected, idempotent)
  app.post("/api/invest", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const endpoint = "/api/invest";
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;
    
    try {
      // Acquire idempotency lock (atomic)
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({
        strategyId: z.string(),
        amount: amountSchema,
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const { strategyId, amount } = parsed.data;

      // Gate checks: consent and KYC required
      const security = await storage.getSecuritySettings(userId);
      const kycApplicant = await storage.getKycApplicant(userId);
      
      if (!security?.consentAccepted) {
        const errorBody = { 
          error: "Consent required",
          code: "CONSENT_REQUIRED",
          message: "Please accept the terms and conditions before investing"
        };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 403, errorBody);
        }
        return res.status(403).json(errorBody);
      }
      
      if (kycApplicant?.status !== "APPROVED") {
        const errorBody = { 
          error: "KYC required",
          code: "KYC_REQUIRED",
          message: "Please complete identity verification before investing"
        };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 403, errorBody);
        }
        return res.status(403).json(errorBody);
      }

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        const errorBody = { error: "Strategy not found" };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 404, errorBody);
        }
        return res.status(404).json(errorBody);
      }

      // Check if position is paused (risk control)
      const existingPosition = await storage.getPosition(userId, strategyId);
      if (existingPosition?.paused) {
        const errorBody = { 
          error: "Strategy paused",
          code: "STRATEGY_PAUSED",
          message: existingPosition.pausedReason === "dd_breach" 
            ? "This strategy is paused due to drawdown limit breach. Please review your risk settings."
            : "This strategy is currently paused. Resume it to make new investments."
        };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 403, errorBody);
        }
        return res.status(403).json(errorBody);
      }

      const balance = await storage.getBalance(userId, "USDT");
      if (BigInt(balance?.available || "0") < BigInt(amount)) {
        const errorBody = { error: "Insufficient balance" };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      if (BigInt(amount) < BigInt(strategy.minInvestment)) {
        const errorBody = { error: "Amount below minimum investment", code: "MIN_INVESTMENT", minimum: strategy.minInvestment };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
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
        const errorBody = { error: "Insufficient balance" };
        if (lock?.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });

  // POST /api/payout/daily - Demo daily payout simulation (protected, dev only)
  app.post("/api/payout/daily", isAuthenticated, devOnly, async (req, res) => {
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

  // POST /api/withdraw/usdt (protected, idempotent, 2FA required)
  app.post("/api/withdraw/usdt", isAuthenticated, requireTwoFactor, async (req, res) => {
    const userId = getUserId(req);
    const endpoint = "/api/withdraw/usdt";
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;
    
    try {
      // Acquire idempotency lock (atomic)
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({
        amount: amountSchema,
        address: z.string().min(30),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const { amount, address } = parsed.data;

      // Validate minimum withdrawal
      if (BigInt(amount) < BigInt(MIN_WITHDRAWAL_MINOR)) {
        const errorBody = { error: "Amount below minimum withdrawal", code: "MIN_WITHDRAWAL", minimum: MIN_WITHDRAWAL_MINOR };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      const security = await storage.getSecuritySettings(userId);
      const kycApplicant = await storage.getKycApplicant(userId);

      // Gate checks: consent required
      if (!security?.consentAccepted) {
        const errorBody = { 
          error: "Consent required",
          code: "CONSENT_REQUIRED",
          message: "Please accept the terms and conditions before withdrawing"
        };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 403, errorBody);
        }
        return res.status(403).json(errorBody);
      }

      // Gate checks: KYC required
      if (kycApplicant?.status !== "APPROVED") {
        const errorBody = { 
          error: "KYC required",
          code: "KYC_REQUIRED",
          message: "Please complete identity verification before withdrawing"
        };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 403, errorBody);
        }
        return res.status(403).json(errorBody);
      }

      // Check 2FA
      if (!security?.twoFactorEnabled) {
        const errorBody = { 
          error: "2FA required",
          code: "TWO_FACTOR_REQUIRED",
          message: "Please enable two-factor authentication before withdrawing"
        };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 403, errorBody);
        }
        return res.status(403).json(errorBody);
      }

      // Check whitelist and activation delay
      if (security?.whitelistEnabled) {
        const whitelist = await storage.getWhitelistAddresses(userId);
        const whitelisted = whitelist.find((w) => w.address === address && w.status === AddressStatus.ACTIVE);
        if (!whitelisted) {
          const errorBody = { 
            error: "Whitelist required",
            code: "WHITELIST_REQUIRED",
            message: "Address not in whitelist or not yet active"
          };
          if (lock.acquired) {
            await completeIdempotency(lock.keyId, null, 403, errorBody);
          }
          return res.status(403).json(errorBody);
        }
        // Check activation delay has passed
        if (whitelisted.activatesAt && new Date(whitelisted.activatesAt) > new Date()) {
          const errorBody = { 
            error: "Address not yet active",
            code: "ADDRESS_DELAY_PENDING",
            message: `Address will be active after ${whitelisted.activatesAt.toISOString()}`
          };
          if (lock.acquired) {
            await completeIdempotency(lock.keyId, null, 403, errorBody);
          }
          return res.status(403).json(errorBody);
        }
      }

      const balance = await storage.getBalance(userId, "USDT");
      const fee = NETWORK_FEE_MINOR;
      const totalDeduct = BigInt(amount) + BigInt(fee);
      
      // Check balance includes fee
      if (BigInt(balance?.available || "0") < totalDeduct) {
        const errorBody = { error: "Insufficient balance (including network fee)" };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }

      // ATOMIC TRANSACTION: balance deduct + operation + withdrawal + audit
      const { operation, withdrawal } = await withTransaction(async (tx) => {
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

        // Create withdrawal operation with pending status (no txHash yet)
        const [op] = await tx.insert(operations).values({
          userId,
          type: "WITHDRAW_USDT",
          status: "pending",
          asset: "USDT",
          amount,
          fee,
          txHash: null,
          providerRef: null,
          strategyId: null,
          strategyName: null,
          fromVault: null,
          toVault: null,
          metadata: { address },
          reason: null,
        }).returning();

        // Create withdrawal record with PENDING_REVIEW status, linked to operation
        const [wd] = await tx.insert(withdrawals).values({
          userId,
          amountMinor: amount,
          feeMinor: fee,
          currency: "USDT",
          address,
          status: "PENDING_REVIEW",
          operationId: op.id,
        }).returning();

        // Audit log (no address for privacy)
        await tx.insert(auditLogs).values({
          userId,
          event: "WITHDRAW_USDT",
          resourceType: "withdrawal",
          resourceId: wd.id,
          details: {
            amountMinor: amount,
            feeMinor: fee,
            asset: "USDT",
            operationId: op.id,
            idempotencyKey: req.headers["idempotency-key"] || null,
            requestId: req.requestId,
          },
          ip: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });

        return { operation: op, withdrawal: wd };
      });

      const responseBody = { success: true, withdrawalId: withdrawal.id, operationId: operation.id };
      if (lock.acquired) {
        await completeIdempotency(lock.keyId, operation.id, 200, responseBody);
      }
      res.json(responseBody);
    } catch (error) {
      console.error("Withdraw error:", error);
      if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") {
        const errorBody = { error: "Insufficient balance" };
        if (lock?.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });

  // POST /api/vault/transfer (protected, idempotent)
  app.post("/api/vault/transfer", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const endpoint = "/api/vault/transfer";
    let lock: Awaited<ReturnType<typeof acquireIdempotencyLock>> | null = null;
    
    try {
      // Acquire idempotency lock (atomic)
      lock = await acquireIdempotencyLock(req, userId, endpoint);
      if (!lock.acquired) {
        if (lock.cached) {
          return res.status(lock.status).json(lock.body);
        }
      }

      const schema = z.object({
        fromVault: z.string(),
        toVault: z.string(),
        amount: amountSchema,
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const errorBody = { error: "Invalid request data", details: parsed.error.flatten() };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
      }
      const { fromVault, toVault, amount } = parsed.data;

      if (fromVault === toVault) {
        const errorBody = { error: "Source and destination must be different" };
        if (lock.acquired) {
          await completeIdempotency(lock.keyId, null, 400, errorBody);
        }
        return res.status(400).json(errorBody);
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
          const errorBody = { error: "Insufficient wallet balance" };
          if (lock?.acquired) {
            await completeIdempotency(lock.keyId, null, 400, errorBody);
          }
          return res.status(400).json(errorBody);
        }
        if (error.message === "INSUFFICIENT_VAULT_BALANCE") {
          const errorBody = { error: "Insufficient vault balance" };
          if (lock?.acquired) {
            await completeIdempotency(lock.keyId, null, 400, errorBody);
          }
          return res.status(400).json(errorBody);
        }
      }
      const errorBody = { error: "Internal server error" };
      if (lock?.acquired) {
        await completeIdempotency(lock.keyId, null, 500, errorBody);
      }
      res.status(500).json(errorBody);
    }
  });

  // NOTE: Security routes moved to server/routes/security.ts

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
  app.post("/api/onboarding/send-code", isAuthenticated, async (req, res) => {
    try {
      // Demo: In production, would send actual OTP via email/SMS
      res.json({ success: true, message: "Code sent" });
    } catch (error) {
      console.error("Send code error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/verify-code (protected) - Demo: accepts any 6-digit code
  app.post("/api/onboarding/verify-code", isAuthenticated, async (req, res) => {
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
  app.post("/api/onboarding/complete-kyc", isAuthenticated, async (req, res) => {
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
  app.get("/api/sumsub/access-token", isAuthenticated, async (req, res) => {
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
  // In production, this would verify HMAC signature from Sumsub
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  const SUMSUB_WEBHOOK_SECRET = process.env.SUMSUB_WEBHOOK_SECRET;
  
  app.post("/api/sumsub/webhook", async (req, res) => {
    try {
      // In production, require webhook secret
      if (IS_PRODUCTION && !SUMSUB_WEBHOOK_SECRET) {
        console.error("Sumsub webhook: SUMSUB_WEBHOOK_SECRET not configured");
        return res.status(500).json({ error: "Service not configured" });
      }

      // Verify webhook secret
      const webhookSecret = req.headers["x-sumsub-secret"] || req.headers["x-webhook-secret"];
      const expectedSecret = SUMSUB_WEBHOOK_SECRET || "demo-webhook-secret";
      
      if (webhookSecret !== expectedSecret) {
        console.warn("Sumsub webhook: invalid or missing secret");
        return res.status(401).json({ error: "Unauthorized" });
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

      const parseResult = webhookSchema.safeParse(req.body);
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
        const { KycStatusToSecurityStatus, KycStatus: KycStatusEnum } = await import("@shared/schema");
        
        await storage.updateKycApplicant(userId, {
          status: newStatus,
          reviewedAt: ["APPROVED", "REJECTED"].includes(newStatus) ? new Date() : undefined,
          rejectionReason,
          needsActionReason,
        });

        // Sync securitySettings.kycStatus for ALL status changes
        const securityStatus = KycStatusToSecurityStatus[newStatus as keyof typeof KycStatusEnum];
        if (securityStatus) {
          await storage.updateSecuritySettings(userId, { kycStatus: securityStatus });
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
  app.post("/api/sumsub/demo-callback", isAuthenticated, async (req, res) => {
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
  app.post("/api/fx/quote", async (req, res) => {
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

  // NOTE: Notification routes moved to server/routes/notifications.ts

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
        if (!address || address.status !== AddressStatus.ACTIVE) {
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
  app.post("/api/jobs/accrue-daily", isAuthenticated, devOnly, async (req, res) => {
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
  app.post("/api/jobs/payout-run", isAuthenticated, devOnly, async (req, res) => {
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
        if (!address || address.status !== AddressStatus.ACTIVE) {
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
  app.post("/api/jobs/redemption-weekly-run", isAuthenticated, devOnly, async (req, res) => {
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

  // ==================== MARKET DATA ====================

  // GET /api/market/candles - Get candles for a symbol (with backfill if needed)
  app.get("/api/market/candles", isAuthenticated, async (req, res) => {
    try {
      const { symbol, timeframe, startMs, endMs, exchange = "binance_spot" } = req.query;
      
      if (!symbol || typeof symbol !== "string") {
        return res.status(400).json({ error: "symbol is required" });
      }
      if (!timeframe || typeof timeframe !== "string") {
        return res.status(400).json({ error: "timeframe is required (15m, 1h, 1d)" });
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
        timeframe,
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

  return httpServer;
}
