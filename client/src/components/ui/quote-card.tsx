import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";

interface QuoteCardProps {
  pair: string;
  price: string;
  change24h: string;
  series: Array<{ price: string }>;
}

export function QuoteCard({ pair, price, change24h, series }: QuoteCardProps) {
  const changeNum = parseFloat(change24h);
  const isPositive = changeNum >= 0;

  const sparklineData = series.slice(-24).map((s) => ({
    value: parseFloat(s.price),
  }));

  const formatPrice = () => {
    const num = parseFloat(price);
    if (pair === "USDT/RUB") {
      return num.toFixed(2);
    }
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  return (
    <Card className="p-4 hover-elevate cursor-pointer" data-testid={`quote-card-${pair.replace("/", "-").toLowerCase()}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-foreground">{pair}</p>
          <p className="text-lg font-semibold tabular-nums mt-0.5">{formatPrice()}</p>
        </div>
        <span
          className={cn(
            "text-xs font-medium tabular-nums px-2 py-0.5 rounded-full",
            isPositive ? "text-positive bg-positive/10" : "text-negative bg-negative/10"
          )}
        >
          {isPositive ? "+" : ""}{changeNum.toFixed(2)}%
        </span>
      </div>
      <div className="h-6">
        <Sparkline data={sparklineData} positive={isPositive} height={24} />
      </div>
    </Card>
  );
}
