import type { RouteDeps } from "./types";
import { z } from "zod";
import { validateTelegramInitData } from "../telegram/validateInitData";
import { requireTelegramJwt } from "../middleware/requireTelegramJwt";
import { signTelegramJwt, verifyTelegramJwt } from "../telegram/jwt";
import { storage } from "../storage";
import rateLimit from "express-rate-limit";

const authPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
});

const linkPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
  code: z.string().trim().min(1, "code is required").max(64, "code is too long"),
});

const telegramAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
});

export function registerTelegramRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  app.post("/api/telegram/auth", telegramAuthLimiter, async (req, res) => {
    const parsedBody = authPayloadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "initData is required",
        },
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TELEGRAM_BOT_TOKEN_MISSING",
          message: "Telegram bot token not configured",
        },
      });
    }

    if (!process.env.TELEGRAM_JWT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TELEGRAM_JWT_SECRET_MISSING",
          message: "Telegram JWT secret not configured",
        },
      });
    }

    try {
      const { telegramUserId } = validateTelegramInitData(parsedBody.data.initData, botToken);

      const linkedAccount = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
      const linkedUserId = linkedAccount?.userId ?? null;

      if (!linkedUserId) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "TELEGRAM_NOT_LINKED",
            message: "Telegram account not linked",
          },
        });
      }

      const token = signTelegramJwt({ userId: linkedUserId, telegramUserId });
      const decoded = verifyTelegramJwt(token);
      const expiresAt = decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;

      return res.status(200).json({
        ok: true,
        data: {
          token,
          expiresAt,
          userId: linkedUserId,
        },
      });
    } catch (_error) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_INIT_DATA",
          message: "Invalid init data",
        },
      });
    }
  });

  app.post("/api/telegram/link/confirm", telegramAuthLimiter, async (req, res) => {
    const parsedBody = linkPayloadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "initData and code are required",
        },
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "TELEGRAM_BOT_TOKEN_MISSING",
          message: "Telegram bot token not configured",
        },
      });
    }

    try {
      const { telegramUserId } = validateTelegramInitData(parsedBody.data.initData, botToken);
      const user = await storage.getUserByTelegramLinkCode(parsedBody.data.code);

      if (!user) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "INVALID_LINK_CODE",
            message: "Invalid link code",
          },
        });
      }

      const existingAccount = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
      if (existingAccount && existingAccount.userId !== user.id) {
        return res.status(409).json({
          ok: false,
          error: {
            code: "TELEGRAM_ALREADY_LINKED",
            message: "Telegram account already linked to another user",
          },
        });
      }

      await storage.upsertTelegramAccount(user.id, telegramUserId);

      return res.status(200).json({
        ok: true,
        data: {
          userId: user.id,
        },
      });
    } catch (_error) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_INIT_DATA",
          message: "Invalid init data",
        },
      });
    }
  });

  app.get("/api/tg/bootstrap", requireTelegramJwt, async (req, res) => {
    try {
      const userId = res.locals.userId as string | undefined;
      if (!userId) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "TELEGRAM_AUTH_REQUIRED",
            message: "Telegram authorization required",
          },
        });
      }

      const [user, balances, positions, unreadCount, strategies] = await Promise.all([
        storage.getUserById(userId),
        storage.getBalances(userId),
        storage.getPositions(userId),
        storage.getUnreadNotificationCount(userId),
        storage.getStrategies(),
      ]);

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
          },
        });
      }

      const strategyMap = new Map(strategies.map((strategy) => [strategy.id, strategy.name]));

      return res.status(200).json({
        ok: true,
        data: {
          user: {
            id: user.id,
            email: user.email ?? undefined,
          },
          balances,
          positions: positions.map((position) => ({
            id: position.id,
            strategyId: position.strategyId,
            strategyName: strategyMap.get(position.strategyId) ?? "Strategy",
            principalMinor: position.principalMinor,
            currentMinor: position.investedCurrentMinor,
          })),
          notifications: {
            unreadCount,
          },
          serverTime: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Telegram bootstrap error:", error);
      return res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load Telegram data",
        },
      });
    }
  });

  app.get("/api/telegram/notifications/status", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const [prefs, account] = await Promise.all([
        storage.getNotificationPreferences(userId),
        storage.getTelegramAccountByUserId(userId),
      ]);

      res.json({
        linked: Boolean(account),
        enabled: prefs.telegramEnabled,
      });
    } catch (error) {
      console.error("Telegram notification status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/telegram/notifications/enable", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const account = await storage.getTelegramAccountByUserId(userId);
      if (!account) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "TELEGRAM_NOT_LINKED",
            message: "Telegram account not linked",
          },
        });
      }

      const updated = await storage.updateNotificationPreferences(userId, { telegramEnabled: true });
      res.json({ linked: true, enabled: updated.telegramEnabled });
    } catch (error) {
      console.error("Enable Telegram notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/telegram/notifications/disable", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const updated = await storage.updateNotificationPreferences(userId, { telegramEnabled: false });
      const account = await storage.getTelegramAccountByUserId(userId);
      res.json({ linked: Boolean(account), enabled: updated.telegramEnabled });
    } catch (error) {
      console.error("Disable Telegram notifications error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
