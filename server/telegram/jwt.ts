import jwt from "jsonwebtoken";

export interface TelegramJwtPayload {
  userId: string;
  telegramUserId: string;
}

function getTelegramJwtSecret(): string {
  const secret = process.env.TELEGRAM_JWT_SECRET;
  if (!secret) {
    throw new Error("TELEGRAM_JWT_SECRET is required");
  }
  return secret;
}

export function signTelegramJwt(
  payload: TelegramJwtPayload,
  expiresIn: jwt.SignOptions["expiresIn"] = "1h",
): string {
  const secret = getTelegramJwtSecret();
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn,
  });
}

export function verifyTelegramJwt(token: string): TelegramJwtPayload & jwt.JwtPayload {
  const secret = getTelegramJwtSecret();
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid Telegram token");
  }

  const payload = decoded as TelegramJwtPayload & jwt.JwtPayload;

  if (!payload.userId || !payload.telegramUserId) {
    throw new Error("Invalid Telegram token payload");
  }

  return payload;
}
