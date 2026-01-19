import { z } from "zod";
import { generateSecret, generate, verify, generateURI } from "otplib";
import QRCode from "qrcode";
import { storage } from "../storage";
import { AddressStatus, twoFactorVerifySchema, twoFactorDisableSchema } from "@shared/schema";
import { isTwoFactorAvailable, encryptSecret, decryptSecret } from "../lib/twofactorCrypto";
import { requireTwoFactor } from "../middleware/requireTwoFactor";
import type { RouteDeps } from "./types";

// In-memory rate limiter for 2FA operations
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return false;
  }
  
  entry.count++;
  return true;
}

function incrementRateLimitOnFailure(userId: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  } else {
    entry.count++;
  }
}

const ISSUER = "ZEON";

export function registerSecurityRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  // POST /api/security/2fa/setup - Generate new TOTP secret and QR code
  app.post("/api/security/2fa/setup", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      if (!isTwoFactorAvailable()) {
        return res.status(503).json({ error: "2FA is not available - encryption key not configured" });
      }

      // Check if already enabled
      const existing = await storage.getTwoFactor(userId);
      if (existing?.enabled) {
        return res.status(400).json({ error: "2FA is already enabled. Disable it first to set up again." });
      }

      // Generate new secret (v13 async API)
      const secret = generateSecret();
      
      // Get user info for the label
      const userLabel = `user_${userId.substring(0, 8)}`;
      
      // Create otpauth URL using v13 API
      const otpauthUrl = generateURI({
        issuer: ISSUER,
        label: userLabel,
        secret,
      });
      
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
      
      // Encrypt and store the secret
      const secretEncrypted = encryptSecret(secret, userId);
      await storage.upsertTwoFactor(userId, secretEncrypted);
      
      res.json({
        otpauthUrl,
        qrDataUrl,
        secret, // Also return the secret for manual entry
      });
    } catch (error) {
      console.error("2FA setup error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/2fa/verify - Verify TOTP code and enable 2FA
  app.post("/api/security/2fa/verify", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Rate limiting
      if (!checkRateLimit(userId)) {
        return res.status(429).json({ error: "Too many attempts. Please try again later." });
      }
      
      if (!isTwoFactorAvailable()) {
        return res.status(503).json({ error: "2FA is not available" });
      }

      const parsed = twoFactorVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { code } = parsed.data;

      // Get the pending 2FA setup
      const twoFactorRecord = await storage.getTwoFactor(userId);
      if (!twoFactorRecord) {
        return res.status(400).json({ error: "No 2FA setup in progress. Please start setup first." });
      }
      
      if (twoFactorRecord.enabled) {
        return res.status(400).json({ error: "2FA is already enabled." });
      }

      // Decrypt and verify
      let secret: string;
      try {
        secret = decryptSecret(twoFactorRecord.secretEncrypted, userId);
      } catch (error) {
        console.error("Failed to decrypt 2FA secret:", error);
        return res.status(500).json({ error: "Failed to verify 2FA" });
      }

      // Verify code using otplib
      const isValid = verify({ secret, token: code });
      
      if (!isValid) {
        incrementRateLimitOnFailure(userId);
        return res.status(400).json({ error: "Invalid code. Please try again." });
      }

      // Enable 2FA
      await storage.enableTwoFactor(userId);
      
      // Also update security settings for backwards compatibility
      await storage.updateSecuritySettings(userId, { twoFactorEnabled: true });

      res.json({ success: true, message: "2FA has been enabled successfully." });
    } catch (error) {
      console.error("2FA verify error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/security/2fa/disable - Verify TOTP code and disable 2FA
  app.post("/api/security/2fa/disable", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Rate limiting
      if (!checkRateLimit(userId)) {
        return res.status(429).json({ error: "Too many attempts. Please try again later." });
      }
      
      if (!isTwoFactorAvailable()) {
        return res.status(503).json({ error: "2FA is not available" });
      }

      const parsed = twoFactorDisableSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { code } = parsed.data;

      // Get the 2FA record
      const twoFactorRecord = await storage.getTwoFactor(userId);
      if (!twoFactorRecord || !twoFactorRecord.enabled) {
        return res.status(400).json({ error: "2FA is not enabled." });
      }

      // Decrypt and verify
      let secret: string;
      try {
        secret = decryptSecret(twoFactorRecord.secretEncrypted, userId);
      } catch (error) {
        console.error("Failed to decrypt 2FA secret:", error);
        return res.status(500).json({ error: "Failed to verify 2FA" });
      }

      // Verify code using otplib
      const isValid = verify({ secret, token: code });
      
      if (!isValid) {
        incrementRateLimitOnFailure(userId);
        return res.status(400).json({ error: "Invalid code. Please try again." });
      }

      // Disable 2FA
      await storage.disableTwoFactor(userId);
      
      // Also update security settings for backwards compatibility
      await storage.updateSecuritySettings(userId, { twoFactorEnabled: false });

      res.json({ success: true, message: "2FA has been disabled." });
    } catch (error) {
      console.error("2FA disable error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/security/2fa/status - Get current 2FA status
  app.get("/api/security/2fa/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      const twoFactorRecord = await storage.getTwoFactor(userId);
      
      res.json({
        available: isTwoFactorAvailable(),
        enabled: twoFactorRecord?.enabled ?? false,
        verifiedAt: twoFactorRecord?.verifiedAt?.toISOString() ?? null,
      });
    } catch (error) {
      console.error("2FA status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Legacy: POST /api/security/2fa/toggle - Redirect to proper flow
  app.post("/api/security/2fa/toggle", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { enabled } = parsed.data;

      if (enabled) {
        // Cannot enable via toggle - must use proper setup flow
        return res.status(400).json({ 
          error: "Use /api/security/2fa/setup and /api/security/2fa/verify to enable 2FA" 
        });
      }

      // Check if 2FA is actually enabled
      const twoFactorRecord = await storage.getTwoFactor(userId);
      if (twoFactorRecord?.enabled) {
        return res.status(400).json({ 
          error: "Use /api/security/2fa/disable with a valid code to disable 2FA" 
        });
      }

      // If not enabled, just update settings
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

  // POST /api/security/whitelist/add (protected, 2FA required)
  app.post("/api/security/whitelist/add", isAuthenticated, requireTwoFactor, async (req, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({
        address: z.string().trim().min(30),
        label: z.string().trim().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request data", details: parsed.error.flatten() });
      }
      const { address, label } = parsed.data;

      const security = await storage.getSecuritySettings(userId);
      const delay = security?.addressDelay || 0;

      const activatesAt = delay > 0 ? new Date(Date.now() + delay * 60 * 60 * 1000) : new Date();
      const status = delay > 0 ? AddressStatus.PENDING_ACTIVATION : AddressStatus.ACTIVE;

      await storage.createWhitelistAddress({
        userId,
        address: address.trim(),
        label: label?.trim() || null,
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

  // POST /api/security/whitelist/remove (protected, 2FA required)
  app.post("/api/security/whitelist/remove", isAuthenticated, requireTwoFactor, async (req, res) => {
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
}
