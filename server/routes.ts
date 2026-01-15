import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { randomUUID } from "crypto";

const DEMO_USER_ID = "demo-user";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // GET /api/bootstrap - Main bootstrap endpoint
  app.get("/api/bootstrap", async (req, res) => {
    try {
      const user = await storage.getUser(DEMO_USER_ID);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const balances = await storage.getBalances(DEMO_USER_ID);
      const vaults = await storage.getVaults(DEMO_USER_ID);
      const positions = await storage.getPositions(DEMO_USER_ID);
      const portfolioSeries = await storage.getPortfolioSeries(DEMO_USER_ID, 90);
      const security = await storage.getSecuritySettings(DEMO_USER_ID);

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

      // Build gate flags
      const consentRequired = !user.consentAccepted;
      const kycRequired = user.kycStatus !== "approved";
      const twoFactorRequired = !security?.twoFactorEnabled;
      
      // Check whitelist requirement
      const whitelistAddresses = await storage.getWhitelistAddresses(DEMO_USER_ID);
      const hasActiveWhitelistAddress = whitelistAddresses.some((a) => a.status === "active");
      const whitelistRequired = security?.whitelistEnabled && !hasActiveWhitelistAddress;

      const reasons: string[] = [];
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
          username: user.username,
          consentAccepted: user.consentAccepted,
          kycStatus: user.kycStatus,
        },
        gate: {
          consentRequired,
          kycRequired,
          canDeposit: true,
          canInvest: !consentRequired && !kycRequired,
          canWithdraw: !consentRequired && !kycRequired && !twoFactorRequired && !whitelistRequired,
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
          twoFactorEnabled: false,
          antiPhishingCode: null,
          whitelistEnabled: false,
          addressDelay: 0,
          autoSweepEnabled: false,
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

  // GET /api/operations
  app.get("/api/operations", async (req, res) => {
    try {
      const { filter, q, cursor, limit } = req.query;
      const result = await storage.getOperations(
        DEMO_USER_ID,
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

  // GET /api/operations/:id
  app.get("/api/operations/:id", async (req, res) => {
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

  // POST /api/consent/accept
  app.post("/api/consent/accept", async (req, res) => {
    try {
      await storage.updateUser(DEMO_USER_ID, { consentAccepted: true });
      res.json({ success: true });
    } catch (error) {
      console.error("Consent accept error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/kyc/start - Demo auto-approve
  app.post("/api/kyc/start", async (req, res) => {
    try {
      await storage.updateUser(DEMO_USER_ID, { kycStatus: "approved" });
      await storage.createOperation({
        userId: DEMO_USER_ID,
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

  // POST /api/deposit/usdt/simulate
  app.post("/api/deposit/usdt/simulate", async (req, res) => {
    try {
      const schema = z.object({ amount: z.string() });
      const { amount } = schema.parse(req.body);

      const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
      const newAvailable = (BigInt(balance?.available || "0") + BigInt(amount)).toString();
      await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance?.locked || "0");

      await storage.createOperation({
        userId: DEMO_USER_ID,
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

  // POST /api/deposit/card/simulate
  app.post("/api/deposit/card/simulate", async (req, res) => {
    try {
      const schema = z.object({ amount: z.string() }); // RUB in kopeks
      const { amount } = schema.parse(req.body);

      // Convert RUB to USDT (demo rate: 92.5 RUB per USDT)
      const rubAmount = BigInt(amount);
      const usdtAmount = (rubAmount * 1000000n / 9250n).toString(); // Convert with 6 decimals

      const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
      const newAvailable = (BigInt(balance?.available || "0") + BigInt(usdtAmount)).toString();
      await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance?.locked || "0");

      await storage.createOperation({
        userId: DEMO_USER_ID,
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

  // POST /api/invest
  app.post("/api/invest", async (req, res) => {
    try {
      const schema = z.object({
        strategyId: z.string(),
        amount: z.string(),
      });
      const { strategyId, amount } = schema.parse(req.body);

      const strategy = await storage.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ error: "Strategy not found" });
      }

      const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
      if (BigInt(balance?.available || "0") < BigInt(amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      if (BigInt(amount) < BigInt(strategy.minInvestment)) {
        return res.status(400).json({ error: "Amount below minimum investment" });
      }

      // Deduct from balance
      const newAvailable = (BigInt(balance!.available) - BigInt(amount)).toString();
      await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance!.locked);

      // Create or update position
      let position = await storage.getPosition(DEMO_USER_ID, strategyId);
      if (position) {
        await storage.updatePosition(position.id, {
          principal: (BigInt(position.principal) + BigInt(amount)).toString(),
          currentValue: (BigInt(position.currentValue) + BigInt(amount)).toString(),
        });
      } else {
        await storage.createPosition({
          userId: DEMO_USER_ID,
          strategyId,
          principal: amount,
          currentValue: amount,
        });
      }

      // Create operation
      await storage.createOperation({
        userId: DEMO_USER_ID,
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

  // POST /api/payout/daily - Demo daily payout simulation
  app.post("/api/payout/daily", async (req, res) => {
    try {
      const positions = await storage.getPositions(DEMO_USER_ID);
      
      for (const position of positions) {
        // Simulate ~0.1-0.3% daily return
        const dailyReturn = 0.001 + Math.random() * 0.002;
        const payoutAmount = Math.round(parseFloat(position.currentValue) * dailyReturn).toString();

        // Update position value
        const newCurrentValue = (BigInt(position.currentValue) + BigInt(payoutAmount)).toString();
        await storage.updatePosition(position.id, { currentValue: newCurrentValue });

        // Credit to balance
        const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
        const newAvailable = (BigInt(balance?.available || "0") + BigInt(payoutAmount)).toString();
        await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance?.locked || "0");

        const strategy = await storage.getStrategy(position.strategyId);

        // Create payout operation
        await storage.createOperation({
          userId: DEMO_USER_ID,
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
        const security = await storage.getSecuritySettings(DEMO_USER_ID);
        if (security?.autoSweepEnabled) {
          // Move to profit vault
          const profitVault = await storage.getVault(DEMO_USER_ID, "profit");
          const newVaultBalance = (BigInt(profitVault?.balance || "0") + BigInt(payoutAmount)).toString();
          await storage.updateVault(DEMO_USER_ID, "profit", newVaultBalance);

          // Deduct from balance
          const updatedBalance = await storage.getBalance(DEMO_USER_ID, "USDT");
          const afterSweep = (BigInt(updatedBalance?.available || "0") - BigInt(payoutAmount)).toString();
          await storage.updateBalance(DEMO_USER_ID, "USDT", afterSweep, updatedBalance?.locked || "0");

          // Create sweep operation
          await storage.createOperation({
            userId: DEMO_USER_ID,
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

  // POST /api/withdraw/usdt
  app.post("/api/withdraw/usdt", async (req, res) => {
    try {
      const schema = z.object({
        amount: z.string(),
        address: z.string().min(30),
      });
      const { amount, address } = schema.parse(req.body);

      const security = await storage.getSecuritySettings(DEMO_USER_ID);

      // Check 2FA
      if (!security?.twoFactorEnabled) {
        return res.status(400).json({ error: "Two-factor authentication required for withdrawals" });
      }

      // Check whitelist
      if (security?.whitelistEnabled) {
        const whitelist = await storage.getWhitelistAddresses(DEMO_USER_ID);
        const whitelisted = whitelist.find((w) => w.address === address && w.status === "active");
        if (!whitelisted) {
          return res.status(400).json({ error: "Address not in whitelist or not yet active" });
        }
      }

      const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
      if (BigInt(balance?.available || "0") < BigInt(amount)) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Deduct from balance (including 1 USDT fee)
      const fee = "1000000"; // 1 USDT
      const totalDeduct = (BigInt(amount) + BigInt(fee)).toString();
      const newAvailable = (BigInt(balance!.available) - BigInt(totalDeduct)).toString();
      await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance!.locked);

      // Create withdrawal operation
      await storage.createOperation({
        userId: DEMO_USER_ID,
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

  // POST /api/vault/transfer
  app.post("/api/vault/transfer", async (req, res) => {
    try {
      const schema = z.object({
        fromVault: z.string(),
        toVault: z.string(),
        amount: z.string(),
      });
      const { fromVault, toVault, amount } = schema.parse(req.body);

      if (fromVault === "wallet") {
        // Transfer from wallet to vault
        const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
        if (BigInt(balance?.available || "0") < BigInt(amount)) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        const newAvailable = (BigInt(balance!.available) - BigInt(amount)).toString();
        await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance!.locked);

        const vault = await storage.getVault(DEMO_USER_ID, toVault);
        const newVaultBalance = (BigInt(vault?.balance || "0") + BigInt(amount)).toString();
        await storage.updateVault(DEMO_USER_ID, toVault, newVaultBalance);
      } else if (toVault === "wallet") {
        // Transfer from vault to wallet
        const vault = await storage.getVault(DEMO_USER_ID, fromVault);
        if (BigInt(vault?.balance || "0") < BigInt(amount)) {
          return res.status(400).json({ error: "Insufficient vault balance" });
        }

        const newVaultBalance = (BigInt(vault!.balance) - BigInt(amount)).toString();
        await storage.updateVault(DEMO_USER_ID, fromVault, newVaultBalance);

        const balance = await storage.getBalance(DEMO_USER_ID, "USDT");
        const newAvailable = (BigInt(balance?.available || "0") + BigInt(amount)).toString();
        await storage.updateBalance(DEMO_USER_ID, "USDT", newAvailable, balance?.locked || "0");
      }

      // Create operation
      await storage.createOperation({
        userId: DEMO_USER_ID,
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

  // POST /api/security/2fa/toggle
  app.post("/api/security/2fa/toggle", async (req, res) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);

      await storage.updateSecuritySettings(DEMO_USER_ID, { twoFactorEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("2FA toggle error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/whitelist/toggle
  app.post("/api/security/whitelist/toggle", async (req, res) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);

      await storage.updateSecuritySettings(DEMO_USER_ID, { whitelistEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("Whitelist toggle error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/security/whitelist
  app.get("/api/security/whitelist", async (req, res) => {
    try {
      const addresses = await storage.getWhitelistAddresses(DEMO_USER_ID);
      res.json(addresses);
    } catch (error) {
      console.error("Get whitelist error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/whitelist/add
  app.post("/api/security/whitelist/add", async (req, res) => {
    try {
      const schema = z.object({
        address: z.string().min(30),
        label: z.string().optional(),
      });
      const { address, label } = schema.parse(req.body);

      const security = await storage.getSecuritySettings(DEMO_USER_ID);
      const delay = security?.addressDelay || 0;

      const activatesAt = delay > 0 ? new Date(Date.now() + delay * 60 * 60 * 1000) : new Date();
      const status = delay > 0 ? "pending" : "active";

      await storage.createWhitelistAddress({
        userId: DEMO_USER_ID,
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

  // POST /api/security/whitelist/remove
  app.post("/api/security/whitelist/remove", async (req, res) => {
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

  // POST /api/security/address-delay
  app.post("/api/security/address-delay", async (req, res) => {
    try {
      const schema = z.object({ delay: z.number().min(0).max(24) });
      const { delay } = schema.parse(req.body);

      await storage.updateSecuritySettings(DEMO_USER_ID, { addressDelay: delay });
      res.json({ success: true });
    } catch (error) {
      console.error("Address delay error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/anti-phishing
  app.post("/api/security/anti-phishing", async (req, res) => {
    try {
      const schema = z.object({ code: z.string().min(1).max(20) });
      const { code } = schema.parse(req.body);

      await storage.updateSecuritySettings(DEMO_USER_ID, { antiPhishingCode: code });
      res.json({ success: true });
    } catch (error) {
      console.error("Anti-phishing error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/auto-sweep
  app.post("/api/security/auto-sweep", async (req, res) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const { enabled } = schema.parse(req.body);

      await storage.updateSecuritySettings(DEMO_USER_ID, { autoSweepEnabled: enabled });
      res.json({ success: true });
    } catch (error) {
      console.error("Auto-sweep toggle error:", error);
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
