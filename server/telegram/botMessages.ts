export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  web_app?: {
    url: string;
  };
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export function getTelegramWebAppUrl(): string {
  const url = process.env.TELEGRAM_PUBLIC_WEBAPP_URL;
  if (!url) {
    throw new Error("TELEGRAM_PUBLIC_WEBAPP_URL is required");
  }
  return url;
}

export function buildTelegramKeyboard(options: {
  webAppUrl: string;
  refreshToken?: string;
  pauseToken?: string;
  pauseLabel?: string;
}): TelegramInlineKeyboardMarkup {
  const { webAppUrl, refreshToken, pauseToken, pauseLabel = "Pause" } = options;
  const rows: TelegramInlineKeyboardButton[][] = [
    [
      {
        text: "Open App",
        web_app: { url: webAppUrl },
      },
    ],
  ];

  const actionRow: TelegramInlineKeyboardButton[] = [];
  if (refreshToken) {
    actionRow.push({ text: "Refresh", callback_data: `a:${refreshToken}` });
  }
  if (pauseToken) {
    actionRow.push({ text: pauseLabel, callback_data: `a:${pauseToken}` });
  }
  if (actionRow.length > 0) {
    rows.push(actionRow);
  }

  return { inline_keyboard: rows };
}

export function formatMinorUnits(minorUnits: string, decimals: number = 6): string {
  const value = BigInt(minorUnits || "0");
  const factor = 10n ** BigInt(decimals);
  const whole = value / factor;
  const fraction = value % factor;
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole.toString()}.${fractionStr}`;
}
