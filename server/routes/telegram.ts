import { z } from "zod";
import type { RouteDeps } from "./types";
import {
  confirmTelegramLink,
  createTelegramLinkToken,
  getTelegramAuthUserId,
  validateTelegramInitData,
} from "../services/telegram";

const linkConfirmSchema = z.object({
  initData: z.string().min(1),
  code: z.string().min(4).max(10),
});

const telegramAuthSchema = z.object({
  initData: z.string().min(1),
});

export function registerTelegramRoutes({ app, isAuthenticated, getUserId }: RouteDeps): void {
  app.post("/api/telegram/link-token", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { code, expiresAt } = await createTelegramLinkToken(userId);

      res.json({
        ok: true,
        data: {
          code,
          expiresAt,
        },
      });
    } catch (error) {
      console.error("Failed to create Telegram link token:", error);
      res.status(500).json({ ok: false, error: { code: "TOKEN_CREATE_FAILED", message: "Internal server error" } });
    }
  });

  app.post("/api/telegram/link/confirm", async (req, res) => {
    const parsed = linkConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Invalid request payload" },
      });
    }

    const { initData, code } = parsed.data;
    const validation = validateTelegramInitData(initData);

    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_INIT_DATA", message: validation.error },
      });
    }

    const telegramUserId = validation.data.user?.id?.toString();
    if (!telegramUserId) {
      return res.status(400).json({
        ok: false,
        error: { code: "MISSING_TELEGRAM_USER", message: "Telegram user id missing" },
      });
    }

    const result = await confirmTelegramLink(code, telegramUserId);
    if (!result.ok) {
      const status = result.error.code === "TELEGRAM_ALREADY_LINKED" ? 409 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true });
  });

  app.post("/api/telegram/auth", async (req, res) => {
    const parsed = telegramAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_REQUEST", message: "Invalid request payload" },
      });
    }

    const validation = validateTelegramInitData(parsed.data.initData);
    if (!validation.ok) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_INIT_DATA", message: validation.error },
      });
    }

    const telegramUserId = validation.data.user?.id?.toString();
    if (!telegramUserId) {
      return res.status(400).json({
        ok: false,
        error: { code: "MISSING_TELEGRAM_USER", message: "Telegram user id missing" },
      });
    }

    const userId = await getTelegramAuthUserId(telegramUserId);
    if (!userId) {
      return res.status(404).json({
        ok: false,
        error: { code: "TELEGAM_NOT_LINKED", message: "Telegram account not linked" },
      });
    }

    return res.json({ ok: true, data: { userId } });
  });
}
