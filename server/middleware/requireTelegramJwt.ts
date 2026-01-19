import type { Request, Response, NextFunction } from "express";
import { verifyTelegramJwt } from "../telegram/jwt";

export function requireTelegramJwt(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({
      ok: false,
      error: {
        code: "TELEGRAM_AUTH_REQUIRED",
        message: "Telegram authorization required",
      },
    });
    return;
  }

  try {
    const payload = verifyTelegramJwt(token);
    res.locals.userId = payload.userId;
    next();
  } catch (_error) {
    res.status(401).json({
      ok: false,
      error: {
        code: "TELEGRAM_AUTH_INVALID",
        message: "Invalid or expired Telegram token",
      },
    });
  }
}
