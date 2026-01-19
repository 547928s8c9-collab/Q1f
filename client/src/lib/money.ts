export const toMinorUnits = (displayValue: string, decimals: number): string => {
  const normalized = displayValue.replace(/\s+/g, "").replace(",", ".");

  if (!normalized || normalized === ".") return "";

  const parts = normalized.split(".");
  if (parts.length > 2) return "";

  const [wholeRaw, fractionRaw = ""] = parts;

  if (!/^\d*$/.test(wholeRaw) || !/^\d*$/.test(fractionRaw)) return "";

  const whole = wholeRaw || "0";
  const fraction = fractionRaw.padEnd(decimals, "0").slice(0, decimals);
  const combined = `${whole}${fraction}`;

  return combined.replace(/^0+(?=\d)/, "");
};
