import { storage } from "../storage";
import { TelegramSendError } from "../telegram/sendMessage";
import { sendTelegramMessageWithKeyboard, type InlineKeyboardButton } from "../telegram/botApi";

const POLL_INTERVAL_MS = 3000;
const BATCH_SIZE = 20;

let workerTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

interface TelegramOutboxPayload {
  userId: string;
  telegramUserId: string;
  notificationType?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  resourceType?: string | null;
  resourceId?: string | null;
}

export function startOutboxWorker(): void {
  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    void processOutboxBatch();
  }, POLL_INTERVAL_MS);

  void processOutboxBatch();
}

export async function processOutboxBatch(): Promise<void> {
  if (isProcessing) {
    return;
  }

  isProcessing = true;
  try {
    const events = await storage.getPendingOutboxEvents(BATCH_SIZE);
    if (!events.length) {
      return;
    }

    for (const event of events) {
      if (event.eventType !== "telegram.send") {
        continue;
      }

      const payload = event.payloadJson as TelegramOutboxPayload | null;
      if (!payload?.telegramUserId || !payload?.userId) {
        await storage.incrementOutboxAttempt(event.id, "INVALID_PAYLOAD");
        continue;
      }

      const text = buildTelegramMessage(payload);
      if (!text) {
        await storage.incrementOutboxAttempt(event.id, "EMPTY_MESSAGE");
        continue;
      }

      try {
        // Create action token for Refresh button (10 minutes TTL)
        const refreshToken = await storage.createTelegramActionToken({
          telegramUserId: payload.telegramUserId,
          userId: payload.userId,
          action: "REFRESH",
          ttlSeconds: 600, // 10 minutes
        });

        // Build inline keyboard: Row1 = Open App, Row2 = Refresh
        const webappUrl = process.env.TELEGRAM_PUBLIC_WEBAPP_URL || process.env.APP_URL || "https://example.com/tg";
        const keyboard: InlineKeyboardButton[][] = [
          [{ text: "📱 Open App", web_app: { url: webappUrl } }],
          [{ text: "🔄 Refresh", callback_data: `a:${refreshToken.token}` }],
        ];

        await sendTelegramMessageWithKeyboard(payload.telegramUserId, text, {
          disableWebPagePreview: true,
          replyMarkup: { inline_keyboard: keyboard },
        });
        await storage.markOutboxProcessed(event.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const statusCode = error instanceof TelegramSendError ? error.status : undefined;
        await storage.incrementOutboxAttempt(event.id, message);
        console.warn("Telegram send failed", {
          notificationType: payload.notificationType ?? null,
          userId: payload.userId,
          telegramUserId: payload.telegramUserId,
          statusCode: statusCode ?? null,
        });
      }
    }
  } finally {
    isProcessing = false;
  }
}

function buildTelegramMessage(payload: TelegramOutboxPayload): string | null {
  const label = formatNotificationLabel(payload.notificationType);
  const title = sanitizeText(payload.title ?? "");
  const message = sanitizeText(payload.message ?? "");

  const parts = [label, title, message].filter((value) => value.length > 0);

  // Remove the "Открыть: ..." link since we now have inline buttons
  // The buttons will be added via reply_markup

  return parts.length ? parts.join("\n") : null;
}

function formatNotificationLabel(type?: string): string {
  switch (type) {
    case "kyc":
      return "🛂 KYC";
    case "security":
      return "🛡️ Security";
    case "transaction":
      return "💸 Transaction";
    default:
      return "🔔 Notification";
  }
}

function sanitizeText(text: string): string {
  if (!text) {
    return "";
  }

  let sanitized = text;
  sanitized = sanitized.replace(/0x[a-fA-F0-9]{10,}/g, "[redacted]");
  sanitized = sanitized.replace(/\bT[a-zA-Z0-9]{24,}\b/g, "[redacted]");
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{24,}\b/g, "[redacted]");
  return sanitized.trim();
}
