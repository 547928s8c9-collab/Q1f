import { z } from "zod";

const numericEnvSchema = z.string().regex(/^\d+$/, "Expected digits only");
const floatEnvSchema = z.string().refine((value) => !Number.isNaN(Number.parseFloat(value)), {
  message: "Expected a valid float",
});

function getNumericEnv(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  const parsed = numericEnvSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`Invalid numeric environment value for ${name}: ${value}`);
  }

  return parsed.data;
}

function getFloatEnv(name: string, fallback: string): number {
  const value = process.env[name] ?? fallback;
  const parsed = floatEnvSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`Invalid float environment value for ${name}: ${value}`);
  }

  return Number.parseFloat(parsed.data);
}

export const DEPOSIT_ADDRESS = process.env.DEPOSIT_ADDRESS || "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";
export const NETWORK_FEE_MINOR = getNumericEnv("NETWORK_FEE_MINOR", "1000000"); // 1 USDT
export const MIN_WITHDRAWAL_MINOR = getNumericEnv("MIN_WITHDRAWAL_MINOR", "10000000"); // 10 USDT
export const MIN_DEPOSIT_MINOR = getNumericEnv("MIN_DEPOSIT_MINOR", "10000000"); // 10 USDT
export const DEFAULT_RUB_RATE = getFloatEnv("DEFAULT_RUB_RATE", "92.5");

export const NETWORK_FEE_MINOR_BIGINT = BigInt(NETWORK_FEE_MINOR);
export const MIN_WITHDRAWAL_MINOR_BIGINT = BigInt(MIN_WITHDRAWAL_MINOR);
export const MIN_DEPOSIT_MINOR_BIGINT = BigInt(MIN_DEPOSIT_MINOR);
