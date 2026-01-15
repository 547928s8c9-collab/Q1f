import { cn } from "@/lib/utils";

type MoneySize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
type MoneyVariant = "default" | "positive" | "negative" | "muted";

interface MoneyProps {
  value: number | string;
  currency?: string;
  size?: MoneySize;
  variant?: MoneyVariant;
  showSign?: boolean;
  showCurrency?: boolean;
  decimals?: number;
  className?: string;
}

const sizeClasses: Record<MoneySize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl font-semibold",
};

const variantClasses: Record<MoneyVariant, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  muted: "text-muted-foreground",
};

export function Money({
  value,
  currency = "USDT",
  size = "md",
  variant = "default",
  showSign = false,
  showCurrency = true,
  decimals = 2,
  className,
}: MoneyProps) {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  const isNegative = numValue < 0;
  const absValue = Math.abs(numValue);
  
  const autoVariant = variant === "default" && showSign 
    ? (numValue > 0 ? "positive" : numValue < 0 ? "negative" : "default")
    : variant;
  
  const formattedValue = absValue.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const sign = showSign && numValue !== 0 ? (numValue > 0 ? "+" : "-") : (isNegative ? "-" : "");

  return (
    <span
      className={cn(
        "font-money inline-flex items-baseline gap-0.5",
        sizeClasses[size],
        variantClasses[autoVariant],
        className
      )}
      data-testid="text-money"
    >
      {sign && <span className="mr-0.5">{sign}</span>}
      <span>{formattedValue}</span>
      {showCurrency && (
        <span className="text-muted-foreground text-[0.8em] ml-1">{currency}</span>
      )}
    </span>
  );
}

export function formatMoney(
  minorUnits: number | string, 
  decimals: number = 6,
  options?: { showSign?: boolean }
): string {
  const value = typeof minorUnits === "string" ? parseFloat(minorUnits) : minorUnits;
  const majorUnits = value / Math.pow(10, decimals);
  const sign = options?.showSign && majorUnits > 0 ? "+" : "";
  return sign + majorUnits.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(value: number, options?: { showSign?: boolean }): string {
  const sign = options?.showSign && value > 0 ? "+" : "";
  return sign + value.toFixed(2) + "%";
}
