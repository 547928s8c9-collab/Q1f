const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  return token;
}

async function callTelegramApi<T>(method: string, payload: Record<string, unknown>, attempt = 0): Promise<T> {
  const token = getBotToken();
  const url = `https://api.telegram.org/bot${token}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 429) {
    const data = (await response.json()) as TelegramApiResponse<T>;
    const retryAfter = data.parameters?.retry_after ?? 1;
    if (attempt < BACKOFF_STEPS_MS.length) {
      await sleep(retryAfter * 1000);
      return callTelegramApi(method, payload, attempt + 1);
    }
    throw new Error(`Telegram API rate limit exceeded (${retryAfter}s)`);
  }

  if (response.status >= 500 && response.status < 600) {
    if (attempt < BACKOFF_STEPS_MS.length) {
      const backoffMs = BACKOFF_STEPS_MS[Math.min(attempt, BACKOFF_STEPS_MS.length - 1)];
      await sleep(backoffMs);
      return callTelegramApi(method, payload, attempt + 1);
    }
    throw new Error(`Telegram API server error: ${response.status}`);
  }

  const data = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !data.ok) {
    console.error("Telegram API error", {
      method,
      status: response.status,
      description: data.description,
    });
    throw new Error(data.description || `Telegram API error ${response.status}`);
  }

  return data.result as T;
}

export async function botSendMessage(
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

export async function botEditMessageText(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  await callTelegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup,
  });
}

export async function botAnswerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false,
): Promise<void> {
  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}
