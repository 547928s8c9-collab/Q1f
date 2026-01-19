import { parse, validate } from "@tma.js/init-data-node";

interface TelegramInitDataValidationResult {
  telegramUserId: string;
  telegramUser: Record<string, unknown>;
  authDate: number;
}

function createBadRequestError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): TelegramInitDataValidationResult {
  if (!initData?.trim()) {
    throw createBadRequestError("Missing init data");
  }

  if (!botToken?.trim()) {
    throw new Error("Telegram bot token is required for init data validation");
  }

  validate(initData, botToken, { expiresIn: maxAgeSeconds });

  const parsed = parse(initData);
  const telegramUser = parsed.user as Record<string, unknown> | undefined;
  const telegramUserId = telegramUser?.id;
  const authDate = parsed.auth_date;

  if (!telegramUserId) {
    throw createBadRequestError("Telegram user missing in init data");
  }

  if (!authDate) {
    throw createBadRequestError("Auth date missing in init data");
  }

  const authDateSeconds = typeof authDate === "number" ? authDate : Number(authDate);

  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) {
    throw createBadRequestError("Auth date invalid in init data");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (authDateSeconds > nowSeconds + 60) {
    throw createBadRequestError("Auth date is in the future");
  }

  if (nowSeconds - authDateSeconds > maxAgeSeconds) {
    throw createBadRequestError("Auth date is too old");
  }

  return {
    telegramUserId: String(telegramUserId),
    telegramUser,
    authDate: authDateSeconds,
  };
}
