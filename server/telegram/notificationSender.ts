import { botSendMessage } from "./botApi";
import { buildTelegramKeyboard, getTelegramWebAppUrl } from "./botMessages";
import { storage } from "../storage";

const DEFAULT_TTL_SECONDS = 600;

export async function sendTelegramNotification(input: {
  telegramUserId: string;
  userId: string;
  text: string;
  strategyId?: string;
}): Promise<void> {
  if (process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== "true") {
    return;
  }

  const refreshToken = await storage.createTelegramActionToken({
    telegramUserId: input.telegramUserId,
    userId: input.userId,
    action: "REFRESH",
    ttlSeconds: DEFAULT_TTL_SECONDS,
  });

  const replyMarkup = buildTelegramKeyboard({
    webAppUrl: getTelegramWebAppUrl(),
    refreshToken,
  });

  await botSendMessage(input.telegramUserId, input.text, replyMarkup);
}
