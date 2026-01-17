import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let encryptionKey: Buffer | null = null;

export function initTwoFactorCrypto(): void {
  const keyEnv = process.env.TWOFA_ENCRYPTION_KEY;
  
  if (!keyEnv) {
    console.warn("[2FA] TWOFA_ENCRYPTION_KEY not set - 2FA features will be unavailable");
    return;
  }

  try {
    // Try hex first (64 characters = 32 bytes)
    if (/^[a-fA-F0-9]{64}$/.test(keyEnv)) {
      encryptionKey = Buffer.from(keyEnv, "hex");
    } 
    // Try base64 (43-44 characters for 32 bytes)
    else if (keyEnv.length >= 43 && keyEnv.length <= 44) {
      encryptionKey = Buffer.from(keyEnv, "base64");
    } 
    else {
      throw new Error("Invalid key format - must be 64 hex chars or 44 base64 chars");
    }

    if (encryptionKey.length !== 32) {
      throw new Error(`Invalid key length: ${encryptionKey.length} bytes (expected 32)`);
    }

    console.log("[2FA] Encryption key loaded successfully");
  } catch (error) {
    console.error("[2FA] Failed to initialize encryption key:", error);
    encryptionKey = null;
  }
}

export function isTwoFactorAvailable(): boolean {
  return encryptionKey !== null;
}

export function encryptSecret(secret: string, userId: string): string {
  if (!encryptionKey) {
    throw new Error("2FA encryption not initialized");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  
  // Use userId as additional authenticated data (AAD) for integrity binding
  cipher.setAAD(Buffer.from(userId, "utf8"));
  
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: base64(iv):base64(ciphertext):base64(authTag)
  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export function decryptSecret(encryptedData: string, userId: string): string {
  if (!encryptionKey) {
    throw new Error("2FA encryption not initialized");
  }

  try {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "base64");
    const encrypted = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");

    if (iv.length !== IV_LENGTH) {
      throw new Error("Invalid IV length");
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error("Invalid auth tag length");
    }

    const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    // Don't leak details about decryption failures
    throw new Error("Failed to decrypt 2FA secret");
  }
}
