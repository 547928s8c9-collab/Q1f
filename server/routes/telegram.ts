import type { RouteDeps } from "./types";
import { z } from "zod";
import { validateTelegramInitData } from "../telegram/validateInitData";
import { requireTelegramJwt } from "../middleware/requireTelegramJwt";
import { signTelegramJwt, verifyTelegramJwt } from "../telegram/jwt";
import { storage } from "../storage";
import { getPortfolioSummary } from "../app/portfolioService";
import { answerCallbackQuery, editMessageText, sendTelegramMessageWithKeyboard, type InlineKeyboardButton } from "../telegram/botApi";
import { logger } from "../lib/logger";
import rateLimit from "express-rate-limit";

const authPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
});

const linkPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
  code: z.string().trim().min(1, "code is required").max(64, "code is too long"),
});

// Rate limiter for /api/telegram/auth: 30/min per IP
const telegramAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
});

// Rate limiter for /api/telegram/link/confirm: 10/min per IP
const telegramLinkConfirmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
});

// Rate limiter for /api/tg/bootstrap: 60/min per telegramUserId (or IP fallback)
const telegramBootstrapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    // Try to extract telegramUserId from JWT token if available
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (token) {
      try {
        const payload = verifyTelegramJwt(token);
        if (payload.telegramUserId) {
          return `tg-bootstrap:${payload.telegramUserId}`;
        }
      } catch {
        // If JWT is invalid, fallback to IP
      }
    }
    // Fallback to IP
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `tg-bootstrap:ip:${ip}`;
  },
});

export function registerTelegramRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  // POST /api/telegram/link-token - Generate a new link token
  app.post("/api/telegram/link-token", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const result = await storage.createTelegramLinkToken(userId, 10);

      return res.status(200).json({
        ok: true,
        data: {
          code: result.code,
          expiresAt: result.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create link token",
        },
      });
    }
  });

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

  app.post("/api/telegram/link/confirm", telegramLinkConfirmLimiter, async (req, res) => {
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
      
      // Try to consume new link token first
      let userId: string | null = null;
      try {
        const tokenResult = await storage.consumeTelegramLinkToken(parsedBody.data.code);
        userId = tokenResult.userId;
      } catch (tokenError) {
        // If token not found/expired/used, try legacy fallback
        if (tokenError instanceof Error && 
            (tokenError.message === "INVALID_CODE" || 
             tokenError.message === "CODE_EXPIRED" || 
             tokenError.message === "CODE_ALREADY_USED")) {
          // Fallback to legacy antiPhishingCode
          const user = await storage.getUserByTelegramLinkCode(parsedBody.data.code);
          if (user) {
            userId = user.id;
          } else {
            return res.status(400).json({
              ok: false,
              error: {
                code: "INVALID_CODE",
                message: "Invalid or expired link code",
              },
            });
          }
        } else {
          throw tokenError;
        }
      }

      if (!userId) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "INVALID_CODE",
            message: "Invalid link code",
          },
        });
      }

      const existingAccount = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
      if (existingAccount && existingAccount.userId !== userId) {
        return res.status(409).json({
          ok: false,
          error: {
            code: "TELEGRAM_ALREADY_LINKED",
            message: "Telegram account already linked to another user",
          },
        });
      }

      await storage.upsertTelegramAccount(userId, telegramUserId);

      return res.status(200).json({
        ok: true,
        data: {
          userId,
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

  app.get("/api/tg/bootstrap", telegramBootstrapLimiter, requireTelegramJwt, async (req, res) => {
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
      logger.error("Telegram bootstrap error", "telegram-bootstrap", { userId: res.locals.userId }, error);
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
      logger.error("Telegram notification status error", "telegram-notifications", { userId: getUserId(req) }, error);
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
      logger.error("Enable Telegram notifications error", "telegram-notifications", { userId: getUserId(req) }, error);
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
      logger.error("Disable Telegram notifications error", "telegram-notifications", { userId: getUserId(req) }, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/telegram/bot/webhook - Telegram Bot webhook for callback queries and commands
  app.post("/api/telegram/bot/webhook", async (req, res) => {
    try {
      // Security check: in production, require X-Telegram-Bot-Api-Secret-Token header
      if (process.env.NODE_ENV === "production") {
        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!webhookSecret) {
          logger.error("TELEGRAM_WEBHOOK_SECRET not configured in production", "telegram-webhook");
          return res.status(500).json({ ok: false, error: "Webhook not configured" });
        }

        const providedSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
        if (providedSecret !== webhookSecret) {
          logger.warn("Invalid webhook secret", "telegram-webhook", { provided: !!providedSecret });
          return res.status(401).json({ ok: false, error: "Unauthorized" });
        }
      }

      const update = req.body as {
        update_id?: number;
        message?: {
          message_id: number;
          from?: { id: number; username?: string; first_name?: string };
          chat: { id: number; type: string };
          text?: string;
        };
        callback_query?: {
          id: string;
          from: { id: number; username?: string; first_name?: string };
          message?: {
            message_id: number;
            chat: { id: number };
          };
          data?: string;
        };
      };

      // Handle callback_query
      if (update.callback_query) {
        const { callback_query } = update;
        const telegramUserId = String(callback_query.from.id);
        const callbackQueryId = callback_query.id;
        const messageId = callback_query.message?.message_id;
        const chatId = callback_query.message?.chat.id;

        // Always answer callback query to remove loading state
        try {
          await answerCallbackQuery(callbackQueryId);
        } catch (error) {
          logger.error("Failed to answer callback query", "telegram-webhook", { callbackQueryId }, error);
        }

        // Parse callback data: format "a:<token>"
        const data = callback_query.data;
        if (!data || !data.startsWith("a:")) {
          logger.warn("Invalid callback data format", "telegram-webhook", { data });
          return res.status(200).json({ ok: true });
        }

        const token = data.slice(2); // Remove "a:" prefix

        try {
          // Consume action token
          const tokenResult = await storage.consumeTelegramActionToken(token, telegramUserId);
          const { action, userId } = tokenResult;

          // Handle REFRESH action
          if (action === "REFRESH" && messageId && chatId) {
            // Get portfolio summary
            const [balances, positions, unreadCount] = await Promise.all([
              storage.getBalances(userId),
              storage.getPositions(userId),
              storage.getUnreadNotificationCount(userId),
            ]);

            const usdtBalance = balances.find((b) => b.asset === "USDT");
            const balanceAvailable = BigInt(usdtBalance?.available ?? "0");
            const balanceFormatted = (Number(balanceAvailable) / 1_000_000).toFixed(2);

            // Format summary message (using HTML for simpler formatting)
            const summaryText = [
              "📊 <b>Portfolio Summary</b>",
              "",
              `💰 Available: ${balanceFormatted} USDT`,
              `📈 Positions: ${positions.length}`,
              `🔔 Unread: ${unreadCount}`,
            ].join("\n");

            // Create new action token for refresh button
            const webappUrl = process.env.TELEGRAM_PUBLIC_WEBAPP_URL || "https://example.com/tg";
            const refreshToken = await storage.createTelegramActionToken({
              telegramUserId,
              userId,
              action: "REFRESH",
              ttlSeconds: 300,
            });

            const keyboard: InlineKeyboardButton[][] = [
              [
                { text: "🔄 Refresh", callback_data: `a:${refreshToken.token}` },
                { text: "📱 Open App", web_app: { url: webappUrl } },
              ],
            ];

            // Edit message with updated summary
            await editMessageText(String(chatId), messageId, summaryText, {
              parseMode: "HTML",
              replyMarkup: { inline_keyboard: keyboard },
            });
          }
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === "INVALID_TOKEN" || error.message === "TOKEN_EXPIRED" || error.message === "TOKEN_ALREADY_USED" || error.message === "TOKEN_USER_MISMATCH") {
              logger.warn("Invalid action token", "telegram-webhook", { telegramUserId, error: error.message });
              return res.status(200).json({ ok: true });
            }
          }
          logger.error("Error processing callback query", "telegram-webhook", { telegramUserId }, error);
        }

        return res.status(200).json({ ok: true });
      }

      // Handle message /start
      if (update.message?.text === "/start") {
        const telegramUserId = String(update.message.from?.id);
        const chatId = update.message.chat.id;

        if (!telegramUserId || !chatId) {
          return res.status(400).json({ ok: false, error: "Invalid message" });
        }

        // Find linked account
        const account = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
        if (!account) {
          const welcomeText = "👋 Welcome! Please link your account first using the web app.";
          await sendTelegramMessageWithKeyboard(String(chatId), welcomeText);
          return res.status(200).json({ ok: true });
        }

        // Get portfolio summary
        const [balances, positions, unreadCount] = await Promise.all([
          storage.getBalances(account.userId),
          storage.getPositions(account.userId),
          storage.getUnreadNotificationCount(account.userId),
        ]);

        const usdtBalance = balances.find((b) => b.asset === "USDT");
        const balanceAvailable = BigInt(usdtBalance?.available ?? "0");
        const balanceFormatted = (Number(balanceAvailable) / 1_000_000).toFixed(2);

        // Format welcome message (using HTML for simpler formatting)
        const welcomeText = [
          "👋 <b>Welcome to your Portfolio!</b>",
          "",
          `💰 Available: ${balanceFormatted} USDT`,
          `📈 Positions: ${positions.length}`,
          `🔔 Unread: ${unreadCount}`,
        ].join("\n");

        // Create action token for refresh button
        const refreshToken = await storage.createTelegramActionToken({
          telegramUserId,
          userId: account.userId,
          action: "REFRESH",
          ttlSeconds: 300,
        });

        const webappUrl = process.env.TELEGRAM_PUBLIC_WEBAPP_URL || "https://example.com/tg";
        const keyboard: InlineKeyboardButton[][] = [
          [
            { text: "🔄 Refresh", callback_data: `a:${refreshToken.token}` },
            { text: "📱 Open App", web_app: { url: webappUrl } },
          ],
        ];

        await sendTelegramMessageWithKeyboard(String(chatId), welcomeText, {
          parseMode: "HTML",
          replyMarkup: { inline_keyboard: keyboard },
        });

        return res.status(200).json({ ok: true });
      }

      // Unknown update type
      return res.status(200).json({ ok: true });
    } catch (error) {
      logger.error("Webhook error", "telegram-webhook", {}, error);
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  });
}
