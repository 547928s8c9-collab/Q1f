type TelegramParseMode = "HTML" | "MarkdownV2";

interface SendTelegramMessageOptions {
  parseMode?: TelegramParseMode;
  disableWebPagePreview?: boolean;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_RETRIES = 5;
const RETRY_BACKOFF_MS = [500, 1000, 2000, 4000];

export class TelegramSendError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage(
  telegramUserId: string,
  text: string,
  opts?: SendTelegramMessageOptions
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  let attempt = 0;
  let lastStatus: number | undefined;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text,
        parse_mode: opts?.parseMode,
        disable_web_page_preview: opts?.disableWebPagePreview,
      }),
    });

    lastStatus = response.status;

    if (response.ok) {
      return;
    }

    if (response.status === 429) {
      let retryAfterSeconds = 1;
      try {
        const body = await response.json();
        const retryAfter = body?.parameters?.retry_after;
        if (typeof retryAfter === "number") {
          retryAfterSeconds = retryAfter;
        }
      } catch {
        retryAfterSeconds = 1;
      }
      await sleep(retryAfterSeconds * 1000);
      continue;
    }

    if (response.status >= 500 && response.status < 600) {
      const backoffMs = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
      await sleep(backoffMs);
      continue;
    }

    throw new TelegramSendError(`Telegram send failed with status ${response.status}`, response.status);
  }

  throw new TelegramSendError("Telegram send failed after retries", lastStatus);
}
