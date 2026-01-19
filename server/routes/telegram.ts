import type { RouteDeps } from "./types";
import { z } from "zod";
import { validateTelegramInitData } from "../telegram/validateInitData";
import { requireTelegramJwt } from "../middleware/requireTelegramJwt";
import { signTelegramJwt, verifyTelegramJwt } from "../telegram/jwt";
import { storage } from "../storage";
import { botAnswerCallbackQuery, botEditMessageText, botSendMessage } from "../telegram/botApi";
import { buildTelegramKeyboard, formatMinorUnits, getTelegramWebAppUrl, type TelegramInlineKeyboardMarkup } from "../telegram/botMessages";
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

type TelegramUpdate = {
  message?: {
    text?: string;
    from?: { id: number };
    chat?: { id: number; type?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { message_id?: number; chat?: { id: number; type?: string } };
  };
};

async function buildTelegramSummaryText(userId: string): Promise<string> {
  const [balances, positions, unreadCount] = await Promise.all([
    storage.getBalances(userId),
    storage.getPositions(userId),
    storage.getUnreadNotificationCount(userId),
  ]);

  const usdtBalance = balances.find((balance) => balance.asset === "USDT");
  const formattedBalance = formatMinorUnits(usdtBalance?.available ?? "0");

  return [
    "Сводка",
    `Баланс USDT: ${formattedBalance}`,
    `Позиции: ${positions.length}`,
    `Непрочитанные уведомления: ${unreadCount}`,
    `Обновлено: ${new Date().toLocaleString("ru-RU")}`,
  ].join("\n");
}

async function createRefreshKeyboard(telegramUserId: string, userId: string): Promise<TelegramInlineKeyboardMarkup> {
  const refreshToken = await storage.createTelegramActionToken({
    telegramUserId,
    userId,
    action: "REFRESH",
    ttlSeconds: 600,
  });
  return buildTelegramKeyboard({
    webAppUrl: getTelegramWebAppUrl(),
    refreshToken,
  });
}

export function registerTelegramRoutes({ app }: RouteDeps): void {
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

  app.post("/api/telegram/bot/webhook", async (req, res) => {
    const isProduction = process.env.NODE_ENV === "production";
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const providedSecret = req.header("X-Telegram-Bot-Api-Secret-Token");

    if (isProduction) {
      if (!webhookSecret || providedSecret !== webhookSecret) {
        return res.status(401).json({ ok: false });
      }
    } else if (!webhookSecret || providedSecret !== webhookSecret) {
      console.warn("Telegram webhook secret missing or mismatched in dev mode");
    }

    const update = req.body as TelegramUpdate;

    try {
      if (update.message?.text) {
        const chatId = update.message.chat?.id;
        const chatType = update.message.chat?.type;
        const telegramUserId = update.message.from?.id;

        if (!chatId || !telegramUserId) {
          return res.status(200).json({ ok: true });
        }

        if (chatType && chatType !== "private") {
          await botSendMessage(String(chatId), "Используйте бота в приватном чате.");
          return res.status(200).json({ ok: true });
        }

        const account = await storage.getTelegramAccountByTelegramUserId(String(telegramUserId));
        const linkedUserId = account?.userId;
        const webAppUrl = getTelegramWebAppUrl();

        if (update.message.text.startsWith("/start")) {
          if (!linkedUserId) {
            await botSendMessage(
              String(chatId),
              "Привет! Откройте mini app и привяжите аккаунт в /tg.",
              buildTelegramKeyboard({ webAppUrl }),
            );
            return res.status(200).json({ ok: true });
          }

          const replyMarkup = await createRefreshKeyboard(String(telegramUserId), linkedUserId);
          await botSendMessage(
            String(chatId),
            "С возвращением! Нажмите Open App для входа или Refresh для обновления сводки.",
            replyMarkup,
          );
          return res.status(200).json({ ok: true });
        }

        await botSendMessage(String(chatId), "Нажмите Open App, чтобы открыть mini app.", buildTelegramKeyboard({ webAppUrl }));
        return res.status(200).json({ ok: true });
      }

      if (update.callback_query) {
        const { id: callbackId, from, data, message } = update.callback_query;
        const telegramUserId = String(from.id);
        const chatId = message?.chat?.id;
        const chatType = message?.chat?.type;
        const messageId = message?.message_id;
        let callbackText: string | undefined;
        let callbackAlert = false;

        if (chatType && chatType !== "private") {
          callbackText = "Private chat only";
        } else if (!data?.startsWith("a:") || !chatId) {
          callbackText = undefined;
        } else {
          const actionToken = data.slice(2);
          const consumeResult = await storage.consumeTelegramActionToken(actionToken, telegramUserId);

          if (consumeResult.status === "expired") {
            callbackText = "Expired action";
          } else if (consumeResult.status === "used") {
            callbackText = "Already processed";
          } else if (consumeResult.status === "invalid") {
            callbackText = "Invalid action";
          } else {
            const account = await storage.getTelegramAccountByTelegramUserId(telegramUserId);
            if (!account || account.userId !== consumeResult.userId) {
              callbackText = "Unauthorized action";
            } else if (consumeResult.action === "REFRESH") {
              const summary = await buildTelegramSummaryText(account.userId);
              const replyMarkup = await createRefreshKeyboard(telegramUserId, account.userId);

              if (messageId) {
                await botEditMessageText(String(chatId), messageId, summary, replyMarkup);
              } else {
                await botSendMessage(String(chatId), summary, replyMarkup);
              }
            } else {
              callbackText = "Unknown action";
            }
          }
        }
        await botAnswerCallbackQuery(callbackId, callbackText, callbackAlert);
      }
    } catch (error) {
      console.error("Telegram webhook error:", error);
    }

    return res.status(200).json({ ok: true });
  });
}
