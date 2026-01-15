import { formatMoney } from "@shared/schema";

interface BalanceDisplayProps {
  amount: string;
  asset: string;
  size?: "sm" | "md" | "lg" | "xl";
  showAsset?: boolean;
}

export function BalanceDisplay({ amount, asset, size = "md", showAsset = true }: BalanceDisplayProps) {
  const sizeClasses = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-3xl",
  };

  return (
    <span className={`font-semibold tabular-nums ${sizeClasses[size]}`}>
      {formatMoney(amount, asset)}
      {showAsset && (
        <span className="text-muted-foreground font-normal ml-1 text-sm uppercase">
          {asset}
        </span>
      )}
    </span>
  );
}
