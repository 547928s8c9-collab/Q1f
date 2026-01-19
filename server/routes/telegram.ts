import type { RouteDeps } from "./types";
import { z } from "zod";
import { validateTelegramInitData } from "../telegram/validateInitData";
import rateLimit from "express-rate-limit";

const authPayloadSchema = z.object({
  initData: z.string().min(1, "initData is required"),
});

const telegramAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  validate: { xForwardedForHeader: false },
});

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

    try {
      const { telegramUserId } = validateTelegramInitData(parsedBody.data.initData, botToken);

      const linkedUserId = null;

      if (!linkedUserId) {
        return res.status(401).json({
          ok: false,
          error: {
            code: "TELEGRAM_NOT_LINKED",
            message: "Telegram account not linked",
          },
        });
      }

      return res.status(200).json({
        ok: true,
        data: {
          userId: linkedUserId,
          telegramUserId,
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
}
