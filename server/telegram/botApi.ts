import { TelegramSendError } from "./sendMessage";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  web_app?: { url: string };
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOptions {
  parseMode?: "HTML" | "MarkdownV2";
  disableWebPagePreview?: boolean;
  replyMarkup?: InlineKeyboardMarkup;
}

export interface AnswerCallbackQueryOptions {
  text?: string;
  showAlert?: boolean;
  url?: string;
  cacheTime?: number;
}

export interface EditMessageTextOptions {
  parseMode?: "HTML" | "MarkdownV2";
  disableWebPagePreview?: boolean;
  replyMarkup?: InlineKeyboardMarkup;
}

async function callTelegramApi(endpoint: string, body: unknown): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  const url = `${TELEGRAM_API_BASE}/bot${token}/${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new TelegramSendError(
      `Telegram API error: ${response.status} - ${errorText}`,
      response.status
    );
  }

  return response.json();
}

export async function sendTelegramMessageWithKeyboard(
  chatId: string,
  text: string,
  options?: SendMessageOptions
): Promise<unknown> {
  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode,
    disable_web_page_preview: options?.disableWebPagePreview,
    reply_markup: options?.replyMarkup,
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  options?: AnswerCallbackQueryOptions
): Promise<unknown> {
  return callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: options?.text,
    show_alert: options?.showAlert,
    url: options?.url,
    cache_time: options?.cacheTime,
  });
}

export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  options?: EditMessageTextOptions
): Promise<unknown> {
  return callTelegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options?.parseMode,
    disable_web_page_preview: options?.disableWebPagePreview,
    reply_markup: options?.replyMarkup,
  });
}
