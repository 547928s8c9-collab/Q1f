import { db } from "../db";
import { sql } from "drizzle-orm";
import { getPortfolioSummary, reconcilePortfolio } from "../app/portfolioService";
import { storage } from "../storage";
import { authStorage } from "../replit_integrations/auth";
import { AddressStatus } from "@shared/schema";
import { logger } from "../lib/logger";
import type { RouteDeps } from "./types";

export function registerCoreRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
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
      logger.error("Health check error", "core-routes", {}, error);
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
        portfolioSummary,
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
        getPortfolioSummary(userId),
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

      const invested = {
        current: portfolioSummary.totalEquityMinor,
        principal: portfolioSummary.totalAllocatedMinor,
      };

      // Get positions and snapshots for reconciliation check
      const [positions, equitySnapshotsArray] = await Promise.all([
        storage.getPositions(userId),
        storage.getLatestSimEquitySnapshotsForUserLightweight(userId),
      ]);

      const reconciliation = reconcilePortfolio(portfolioSummary, {
        positions: positions.map((p) => ({
          strategyId: p.strategyId,
          investedCurrentMinor: p.investedCurrentMinor,
        })),
        snapshots: equitySnapshotsArray,
        toleranceMinor: 1n, // 1 minor unit tolerance
      });

      if (!reconciliation.ok) {
        logger.warn("Portfolio reconciliation warnings", "core-routes", {
          userId,
          issues: reconciliation.issues,
          details: reconciliation.details,
        });
      }

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

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || null,
        },
        balances,
        vaults,
        invested,
        portfolio: {
          summary: portfolioSummary,
          series: portfolioSeries,
        },
        security: {
          ...security,
          kycStatus: kycApplicantStatus,
          isKycApproved,
        },
        consent: {
          hasAccepted: hasAcceptedConsent,
          currentVersion: latestConsent?.version || null,
          requiredVersion: REQUIRED_CONSENT_VERSION,
          needsReaccept,
          lastAcceptedAt: latestConsent?.acceptedAt?.toISOString() || null,
        },
        onboarding: {
          stage: onboardingStage,
          contactVerified,
          consentAccepted,
          isKycApproved,
        },
        gates: {
          consentRequired,
          kycRequired,
          twoFactorRequired,
          whitelistRequired,
          reasons,
        },
        quotes: {
          btc: latestBtc ? { price: latestBtc.price, change24h: latestBtc.change24h } : null,
          eth: latestEth ? { price: latestEth.price, change24h: latestEth.change24h } : null,
          rub: latestRub ? { price: latestRub.price, change24h: latestRub.change24h } : null,
        },
        whitelistAddresses,
      });
    } catch (error) {
      logger.error("Bootstrap error", "core-routes", { userId: getUserId(req), requestId: req.requestId }, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
