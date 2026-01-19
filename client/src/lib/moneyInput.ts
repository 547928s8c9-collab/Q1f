import { ASSET_DECIMALS, parseMoney } from "@shared/schema";

export function normalizeMoneyInput(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (trimmed.includes(",") && !trimmed.includes(".")) {
    return trimmed.replace(",", ".");
  }
  return trimmed.replace(/,/g, "");
}

export function getMoneyInputState(value: string, asset: string) {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) {
    return { normalized: "", minor: null as string | null, error: "" };
  }
  if (!/^\d*(\.\d*)?$/.test(normalized)) {
    return { normalized, minor: null as string | null, error: "Enter a valid amount" };
  }
  if (normalized === ".") {
    return { normalized, minor: null as string | null, error: "Enter a valid amount" };
  }

  const decimals = ASSET_DECIMALS[asset] ?? 2;
  const [, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    return {
      normalized,
      minor: null as string | null,
      error: `Use up to ${decimals} decimal places`,
    };
  }

  const minor = parseMoney(normalized, asset);
  if (BigInt(minor) <= 0n) {
    return { normalized, minor: null as string | null, error: "Amount must be greater than zero" };
  }

  return { normalized, minor, error: "" };
}
