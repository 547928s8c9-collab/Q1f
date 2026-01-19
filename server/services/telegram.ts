import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, withTransaction } from "../db";
import { telegramAccounts, telegramLinkTokens } from "@shared/schema";

const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 5;

export interface TelegramInitDataUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface TelegramInitData {
  user?: TelegramInitDataUser;
  auth_date?: string;
  query_id?: string;
}

export type TelegramInitValidation =
  | { ok: true; data: TelegramInitData }
  | { ok: false; error: string };

function buildDataCheckString(params: URLSearchParams): string {
  const entries = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  return entries.join("\n");
}

export function validateTelegramInitData(initData: string): TelegramInitValidation {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "MISSING_HASH" };
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = createHash("sha256").update(token).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");

  if (hashBuffer.length !== computedBuffer.length || !timingSafeEqual(hashBuffer, computedBuffer)) {
    return { ok: false, error: "INVALID_HASH" };
  }

  const userRaw = params.get("user");
  let user: TelegramInitDataUser | undefined;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw) as TelegramInitDataUser;
    } catch {
      return { ok: false, error: "INVALID_USER" };
    }
  }

  return {
    ok: true,
    data: {
      user,
      auth_date: params.get("auth_date") ?? undefined,
      query_id: params.get("query_id") ?? undefined,
    },
  };
}

function generateLinkCode(): string {
  const max = 10 ** LINK_CODE_LENGTH;
  return randomInt(0, max).toString().padStart(LINK_CODE_LENGTH, "0");
}

export async function createTelegramLinkToken(userId: string, now = new Date()) {
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateLinkCode();

    try {
      await db.insert(telegramLinkTokens).values({
        code,
        userId,
        expiresAt,
      });

      return { code, expiresAt };
    } catch (error: any) {
      if (error?.code !== "23505" || attempt === MAX_CODE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate unique link code");
}

export type ConfirmTelegramLinkResult =
  | { ok: true }
  | { ok: false; error: { code: string; message: string } };

export async function confirmTelegramLink(
  code: string,
  telegramUserId: string,
  now = new Date()
): Promise<ConfirmTelegramLinkResult> {
  return withTransaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(telegramLinkTokens)
      .where(eq(telegramLinkTokens.code, code))
      .limit(1);

    if (!token) {
      return { ok: false, error: { code: "CODE_INVALID", message: "Code not found" } };
    }

    if (token.usedAt) {
      return { ok: false, error: { code: "CODE_USED", message: "Code has already been used" } };
    }

    if (token.expiresAt <= now) {
      return { ok: false, error: { code: "CODE_EXPIRED", message: "Code has expired" } };
    }

    const [existingAccount] = await tx
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.telegramUserId, telegramUserId))
      .limit(1);

    if (existingAccount && existingAccount.userId !== token.userId) {
      return {
        ok: false,
        error: { code: "TELEGRAM_ALREADY_LINKED", message: "Telegram account already linked" },
      };
    }

    await tx
      .insert(telegramAccounts)
      .values({
        userId: token.userId,
        telegramUserId,
        linkedAt: now,
      })
      .onConflictDoUpdate({
        target: telegramAccounts.userId,
        set: {
          telegramUserId,
          linkedAt: now,
        },
      });

    await tx
      .update(telegramLinkTokens)
      .set({ usedAt: now })
      .where(eq(telegramLinkTokens.code, code));

    return { ok: true };
  });
}

export async function getTelegramAuthUserId(telegramUserId: string): Promise<string | null> {
  const [account] = await db
    .select({ userId: telegramAccounts.userId })
    .from(telegramAccounts)
    .where(eq(telegramAccounts.telegramUserId, telegramUserId))
    .limit(1);

  return account?.userId ?? null;
}
