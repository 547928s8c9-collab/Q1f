import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { decryptSecret, isTwoFactorAvailable } from "../lib/twofactorCrypto";
import { verify } from "otplib";

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

    let secret: string;
    try {
      secret = decryptSecret(twoFactorRecord.secretEncrypted, userId);
    } catch (error) {
      console.error("Failed to decrypt 2FA secret for verification:", error);
      res.status(500).json({ 
        code: "TWO_FACTOR_ERROR",
        error: "Failed to verify 2FA code" 
      });
      return;
    }

    const result = await verify({ secret, token: code });

    if (!result.valid) {
      res.status(403).json({ 
        code: "TWO_FACTOR_INVALID",
        error: "Invalid 2FA code" 
      });
      return;
    }

    next();
  } catch (error) {
    console.error("2FA middleware error:", error);
    res.status(500).json({ 
      code: "TWO_FACTOR_ERROR",
      error: "Internal server error during 2FA verification" 
    });
  }
}
