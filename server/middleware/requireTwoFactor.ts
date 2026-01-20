import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { decryptSecret, isTwoFactorAvailable } from "../lib/twofactorCrypto";
import { verify } from "otplib";
import { logger } from "../lib/logger";
import { rateLimiter, TWO_FA_RATE_LIMIT } from "../lib/rateLimiter";

export function getUserIdFromRequest(req: Request): string {
  const user = (req as any).user;
  if (!user) {
    throw new Error("User not authenticated");
  }
  return user.claims?.sub ?? user.id;
}

export async function requireTwoFactor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = getUserIdFromRequest(req);

    const twoFactorRecord = await storage.getTwoFactor(userId);

    if (!twoFactorRecord?.enabled) {
      return next();
    }

    if (!isTwoFactorAvailable()) {
      res.status(503).json({ 
        code: "TWO_FACTOR_UNAVAILABLE",
        error: "2FA verification is temporarily unavailable" 
      });
      return;
    }

    const code = req.headers["x-2fa-code"] as string | undefined 
      || (req.body as any)?.twoFactorCode as string | undefined;

    if (!code) {
      res.status(403).json({ 
        code: "TWO_FACTOR_REQUIRED",
        error: "Two-factor authentication code is required for this operation" 
      });
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ 
        code: "TWO_FACTOR_INVALID",
        error: "Invalid 2FA code format. Must be 6 digits." 
      });
      return;
    }

    // Rate limiting: Check if user has exceeded attempts
    const rateLimitKey = `2fa:${userId}`;
    const withinLimit = rateLimiter.check(
      rateLimitKey,
      TWO_FA_RATE_LIMIT.maxAttempts,
      TWO_FA_RATE_LIMIT.windowMs
    );

    if (!withinLimit) {
      const resetTime = rateLimiter.getResetTime(rateLimitKey);
      const resetMinutes = resetTime ? Math.ceil(resetTime / 60000) : 15;
      
      logger.warn("2FA rate limit exceeded", "requireTwoFactor", { userId, resetMinutes });
      
      res.status(429).json({ 
        code: "TWO_FACTOR_RATE_LIMIT_EXCEEDED",
        error: `Too many 2FA verification attempts. Please try again in ${resetMinutes} minute(s).`,
        retryAfter: resetTime ? Math.ceil(resetTime / 1000) : 900, // seconds
      });
      return;
    }

    let secret: string;
    try {
      secret = decryptSecret(twoFactorRecord.secretEncrypted, userId);
    } catch (error) {
      logger.error("Failed to decrypt 2FA secret for verification", "requireTwoFactor", { userId }, error);
      res.status(500).json({ 
        code: "TWO_FACTOR_ERROR",
        error: "Failed to verify 2FA code" 
      });
      return;
    }

    const isValid = verify({ secret, token: code });

    if (!isValid) {
      const remaining = rateLimiter.getRemaining(rateLimitKey, TWO_FA_RATE_LIMIT.maxAttempts);
      
      logger.warn("Invalid 2FA code", "requireTwoFactor", { userId, remaining });
      
      res.status(403).json({ 
        code: "TWO_FACTOR_INVALID",
        error: "Invalid 2FA code",
        remainingAttempts: remaining,
      });
      return;
    }

    // Successful verification: reset rate limit
    rateLimiter.reset(rateLimitKey);
    
    next();
  } catch (error) {
    const userId = getUserIdFromRequest(req);
    logger.error("2FA middleware error", "requireTwoFactor", { userId }, error);
    res.status(500).json({ 
      code: "TWO_FACTOR_ERROR",
      error: "Internal server error during 2FA verification" 
    });
  }
}
