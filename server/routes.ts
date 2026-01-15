import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { randomUUID } from "crypto";

import { db } from "./db";
import { sql } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated, authStorage } from "./replit_integrations/auth";

// Helper to get userId from authenticated request
function getUserId(req: Request): string {
  return (req.user as any)?.claims?.sub;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Setup authentication first
  await setupAuth(app);
  registerAuthRoutes(app);

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

      const balances = await storage.getBalances(userId);
      const vaults = await storage.getVaults(userId);
      const positions = await storage.getPositions(userId);
      const portfolioSeries = await storage.getPortfolioSeries(userId, 90);
      const security = await storage.getSecuritySettings(userId);
      const latestConsent = await storage.getLatestConsent(userId, "combined");

      // Consent version (should match the constants in consent routes)
      const REQUIRED_CONSENT_VERSION = "1.0";
      const hasAcceptedConsent = !!latestConsent;
      const needsReaccept = latestConsent ? latestConsent.version !== REQUIRED_CONSENT_VERSION : false;

      // Calculate invested amounts
      const invested = positions.reduce(
        (acc, p) => ({
          current: (BigInt(acc.current) + BigInt(p.currentValue)).toString(),
          principal: (BigInt(acc.principal) + BigInt(p.principal)).toString(),
        }),
        { current: "0", principal: "0" }
      );

      // Get quotes
      const btcQuotes = await storage.getQuotes("BTC/USDT", 90);
      const ethQuotes = await storage.getQuotes("ETH/USDT", 90);
      const rubQuotes = await storage.getQuotes("USDT/RUB", 90);

      const latestBtc = btcQuotes[btcQuotes.length - 1];
      const latestEth = ethQuotes[ethQuotes.length - 1];
      const latestRub = rubQuotes[rubQuotes.length - 1];

      // Build onboarding stage
      const contactVerified = security?.contactVerified ?? false;
      const consentAccepted = security?.consentAccepted ?? false;
      const kycStatus = security?.kycStatus ?? "pending";
      
      type OnboardingStage = "welcome" | "verify" | "consent" | "kyc" | "done";
      let onboardingStage: OnboardingStage = "welcome";
      if (!contactVerified) {
        onboardingStage = "verify";
      } else if (!consentAccepted) {
        onboardingStage = "consent";
      } else if (kycStatus !== "approved") {
        onboardingStage = "kyc";
      } else {
        onboardingStage = "done";
      }

      // Build gate flags (consent and kyc are now on security settings)
      const consentRequired = !consentAccepted;
      const kycRequired = kycStatus !== "approved";
      const twoFactorRequired = !security?.twoFactorEnabled;
      
      // Check whitelist requirement
      const whitelistAddresses = await storage.getWhitelistAddresses(userId);
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

      const vaultMap = vaults.reduce((acc, v) => {
        acc[v.type] = v.balance;
        return acc;
      }, {} as Record<string, string>);

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
          kycStatus,
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
          principal: vaultMap.principal || "0",
          profit: vaultMap.profit || "0",
          taxes: vaultMap.taxes || "0",
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
            price: latestRub?.price || "92.5",
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
          depositAddress: "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL",
          networkFee: "1000000", // 1 USDT in minor units
          minWithdrawal: "10000000", // 10 USDT in minor units
          minDeposit: "10000000", // 10 USDT in minor units
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

  // GET /api/operations/:id (protected)
  app.get("/api/operations/:id", isAuthenticated, async (req, res) => {
    try {
      const operation = await storage.getOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ error: "Operation not found" });
      }
      res.json(operation);
    } catch (error) {
      console.error("Get operation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/kyc/start - Demo auto-approve (protected)
  app.post("/api/kyc/start", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.updateSecuritySettings(userId, { kycStatus: "approved" });
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
      res.json({ success: true, status: "approved" });
    } catch (error) {
      console.error("KYC start error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/deposit/usdt/simulate (protected)
  app.post("/api/deposit/usdt/simulate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ amount: z.string() });
      const { amount } = schema.parse(req.body);

      const balance = await storage.getBalance(userId, "USDT");
      const newAvailable = (BigInt(balance?.available || "0") + BigInt(amount)).toString();
      await storage.updateBalance(userId, "USDT", newAvailable, balance?.locked || "0");

      await storage.createOperation({
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

      res.json({ success: true });
    } catch (error) {
      console.error("Deposit USDT simulate error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/deposit/card/simulate (protected)
  app.post("/api/deposit/card/simulate", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ amount: z.string() }); // RUB in kopeks
      const { amount } = schema.parse(req.body);

      // Convert RUB to USDT using current quote rate
      const rubQuotes = await storage.getQuotes("USDT/RUB", 1);
      const currentRate = rubQuotes.length > 0 ? parseFloat(rubQuotes[0].price) : 92.5;
      const rubAmount = BigInt(amount);
      // rubAmount is in kopeks (RUB * 100), convert to USDT minor units (6 decimals)
      // Formula: (rubAmount / 100) / rate * 1000000 = rubAmount * 10000 / rate
      const usdtAmount = (rubAmount * BigInt(10000) / BigInt(Math.round(currentRate * 100))).toString();

      const balance = await storage.getBalance(userId, "USDT");
      const newAvailable = (BigInt(balance?.available || "0") + BigInt(usdtAmount)).toString();
      await storage.updateBalance(userId, "USDT", newAvailable, balance?.locked || "0");

      await storage.createOperation({
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

      res.json({ success: true, usdtAmount });
    } catch (error) {
      console.error("Deposit card simulate error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/invest (protected)
  app.post("/api/invest", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        strategyId: z.string(),
        amount: z.string(),
      });
      const { strategyId, amount } = schema.parse(req.body);

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const balance = await storage.getBalance(userId, "USDT");
      if (BigInt(balance?.available || "0") < BigInt(amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      if (BigInt(amount) < BigInt(strategy.minInvestment)) {
        return res.status(400).json({ error: "Amount below minimum investment" });
      }

      // Deduct from balance
      const newAvailable = (BigInt(balance!.available) - BigInt(amount)).toString();
      await storage.updateBalance(userId, "USDT", newAvailable, balance!.locked);

      // Create or update position
      let position = await storage.getPosition(userId, strategyId);
      if (position) {
        await storage.updatePosition(position.id, {
          principal: (BigInt(position.principal) + BigInt(amount)).toString(),
          currentValue: (BigInt(position.currentValue) + BigInt(amount)).toString(),
        });
      } else {
        await storage.createPosition({
          userId,
          strategyId,
          principal: amount,
          currentValue: amount,
        });
      }

      // Create operation
      await storage.createOperation({
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
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Invest error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/payout/daily - Demo daily payout simulation (protected)
  app.post("/api/payout/daily", isAuthenticated, async (req, res) => {
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
        await storage.createOperation({
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

        // Auto-sweep if enabled
        const security = await storage.getSecuritySettings(userId);
        if (security?.autoSweepEnabled) {
          // Move to profit vault
          const profitVault = await storage.getVault(userId, "profit");
          const newVaultBalance = (BigInt(profitVault?.balance || "0") + BigInt(payoutAmount)).toString();
          await storage.updateVault(userId, "profit", newVaultBalance);

          // Deduct from balance
          const updatedBalance = await storage.getBalance(userId, "USDT");
          const afterSweep = (BigInt(updatedBalance?.available || "0") - BigInt(payoutAmount)).toString();
          await storage.updateBalance(userId, "USDT", afterSweep, updatedBalance?.locked || "0");

          // Create sweep operation
          await storage.createOperation({
            userId,
            type: "VAULT_TRANSFER",
            status: "completed",
            asset: "USDT",
            amount: payoutAmount,
            fee: "0",
            txHash: null,
            providerRef: null,
            strategyId: null,
            strategyName: null,
            fromVault: "wallet",
            toVault: "profit",
            metadata: { autoSweep: true },
            reason: null,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Daily payout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/withdraw/usdt (protected)
  app.post("/api/withdraw/usdt", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        amount: z.string(),
        address: z.string().min(30),
      });
      const { amount, address } = schema.parse(req.body);

      const security = await storage.getSecuritySettings(userId);

      // Check 2FA
      if (!security?.twoFactorEnabled) {
        return res.status(400).json({ error: "Two-factor authentication required for withdrawals" });
      }

      // Check whitelist
      if (security?.whitelistEnabled) {
        const whitelist = await storage.getWhitelistAddresses(userId);
        const whitelisted = whitelist.find((w) => w.address === address && w.status === "active");
        if (!whitelisted) {
          return res.status(400).json({ error: "Address not in whitelist or not yet active" });
        }
      }

      const balance = await storage.getBalance(userId, "USDT");
      if (BigInt(balance?.available || "0") < BigInt(amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Deduct from balance (including 1 USDT fee)
      const fee = "1000000"; // 1 USDT
      const totalDeduct = (BigInt(amount) + BigInt(fee)).toString();
      const newAvailable = (BigInt(balance!.available) - BigInt(totalDeduct)).toString();
      await storage.updateBalance(userId, "USDT", newAvailable, balance!.locked);

      // Create withdrawal operation
      await storage.createOperation({
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
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Withdraw error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/vault/transfer (protected)
  app.post("/api/vault/transfer", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        fromVault: z.string(),
        toVault: z.string(),
        amount: z.string(),
      });
      const { fromVault, toVault, amount } = schema.parse(req.body);

      if (fromVault === "wallet") {
        // Transfer from wallet to vault
        const balance = await storage.getBalance(userId, "USDT");
        if (BigInt(balance?.available || "0") < BigInt(amount)) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        const newAvailable = (BigInt(balance!.available) - BigInt(amount)).toString();
        await storage.updateBalance(userId, "USDT", newAvailable, balance!.locked);

        const vault = await storage.getVault(userId, toVault);
        const newVaultBalance = (BigInt(vault?.balance || "0") + BigInt(amount)).toString();
        await storage.updateVault(userId, toVault, newVaultBalance);
      } else if (toVault === "wallet") {
        // Transfer from vault to wallet
        const vault = await storage.getVault(userId, fromVault);
        if (BigInt(vault?.balance || "0") < BigInt(amount)) {
          return res.status(400).json({ error: "Insufficient vault balance" });
        }

        const newVaultBalance = (BigInt(vault!.balance) - BigInt(amount)).toString();
        await storage.updateVault(userId, fromVault, newVaultBalance);

        const balance = await storage.getBalance(userId, "USDT");
        const newAvailable = (BigInt(balance?.available || "0") + BigInt(amount)).toString();
        await storage.updateBalance(userId, "USDT", newAvailable, balance?.locked || "0");
      }

      // Create operation
      await storage.createOperation({
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
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Vault transfer error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/2fa/toggle (protected)
  app.post("/api/security/2fa/toggle", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);

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
      const { enabled } = schema.parse(req.body);

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
      const { address, label } = schema.parse(req.body);

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
      const schema = z.object({ addressId: z.string() });
      const { addressId } = schema.parse(req.body);

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
      const { delay } = schema.parse(req.body);

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
      const { code } = schema.parse(req.body);

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
      const { enabled } = schema.parse(req.body);

      await storage.updateSecuritySettings(userId, { autoSweepEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("Auto-sweep toggle error:", error);
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
      const { code } = schema.parse(req.body);

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

  // POST /api/onboarding/accept-consent (protected)
  app.post("/api/onboarding/accept-consent", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.updateSecuritySettings(userId, { consentAccepted: true });
      res.json({ success: true });
    } catch (error) {
      console.error("Accept consent error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/start-kyc (protected) - Demo: marks KYC as processing
  app.post("/api/onboarding/start-kyc", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.updateSecuritySettings(userId, { kycStatus: "processing" });
      res.json({ success: true, status: "processing" });
    } catch (error) {
      console.error("Start KYC error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/onboarding/complete-kyc (protected) - Demo: approves KYC
  app.post("/api/onboarding/complete-kyc", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      await storage.updateSecuritySettings(userId, { kycStatus: "approved" });
      res.json({ success: true, status: "approved" });
    } catch (error) {
      console.error("Complete KYC error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== CONSENT ROUTES ====================

  // Current consent version and document hash (would be managed separately in production)
  const CURRENT_CONSENT_VERSION = "1.0";
  const CURRENT_DOC_HASH = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

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

  // POST /api/consent/accept (protected, idempotent)
  app.post("/api/consent/accept", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const ip = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      const userAgent = req.headers["user-agent"] || "unknown";

      // Check if user already accepted current version (idempotent)
      const latestConsent = await storage.getLatestConsent(userId, "combined");
      if (latestConsent?.version === CURRENT_CONSENT_VERSION) {
        return res.json({
          success: true,
          alreadyAccepted: true,
          consentId: latestConsent.id,
          acceptedAt: latestConsent.acceptedAt?.toISOString(),
        });
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

      res.json({
        success: true,
        alreadyAccepted: false,
        consentId: consent.id,
        acceptedAt: consent.acceptedAt?.toISOString(),
      });
    } catch (error) {
      console.error("Accept consent error:", error);
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
      const { fromAsset, toAsset, amount } = schema.parse(req.body);

      // Demo rates
      const rates: Record<string, Record<string, number>> = {
        RUB: { USDT: 1 / 92.5 },
        USDT: { RUB: 92.5 },
      };

      const rate = rates[fromAsset]?.[toAsset] || 1;
      const toAmount = Math.round(parseFloat(amount) * rate).toString();

      res.json({ fromAsset, toAsset, fromAmount: amount, toAmount, rate: rate.toString() });
    } catch (error) {
      console.error("FX quote error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
