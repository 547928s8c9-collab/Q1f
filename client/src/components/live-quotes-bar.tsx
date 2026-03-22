import { useRef, useEffect, useState, memo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MarketQuote } from "@/hooks/use-market-stream";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

interface LiveQuotesBarProps {
  quotes: MarketQuote[];
  sparklines: Map<string, number[]>;
}

const SYMBOL_ICONS: Record<string, string> = {
  BTCUSDT: "₿",
  ETHUSDT: "Ξ",
  BNBUSDT: "B",
  SOLUSDT: "◎",
  XRPUSDT: "✕",
  DOGEUSDT: "Ð",
  ADAUSDT: "₳",
  TRXUSDT: "T",
};

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(5);
}

const MiniSparkline = memo(function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const chartData = data.map((value) => ({ value }));
  const color = positive ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)";

  return (
    <div className="w-16 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const QuoteCard = memo(function QuoteCard({ quote, sparkline }: { quote: MarketQuote; sparkline?: number[] }) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef(quote.price);

  useEffect(() => {
    if (quote.price !== prevPriceRef.current) {
      const direction = quote.price > prevPriceRef.current ? "up" : "down";
      setFlash(direction);
      prevPriceRef.current = quote.price;
      const timer = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(timer);
    }
  }, [quote.price]);

  const isPositive = quote.change24hPct >= 0;
  const icon = SYMBOL_ICONS[quote.symbol] || "•";
  const shortName = quote.pair.split("/")[0];

  return (
    <Card
      className={cn(
        "flex-shrink-0 p-3 min-w-[160px] transition-colors duration-300 border",
        flash === "up" && "price-flash-up",
        flash === "down" && "price-flash-down"
      )}
      data-testid={`quote-card-${quote.symbol}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base font-bold">{icon}</span>
          <span className="text-xs font-semibold">{shortName}</span>
        </div>
        {isPositive ? (
          <TrendingUp className="w-3 h-3 text-[hsl(var(--success))]" />
        ) : (
          <TrendingDown className="w-3 h-3 text-[hsl(var(--danger))]" />
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-sm font-bold tabular-nums leading-tight" data-testid={`price-${quote.symbol}`}>
            {formatPrice(quote.price)}
          </p>
          <p
            className={cn(
              "text-xs font-medium tabular-nums",
              isPositive ? "text-[hsl(var(--success))]" : "text-[hsl(var(--danger))]"
            )}
          >
            {isPositive ? "+" : ""}{quote.change24hPct.toFixed(2)}%
          </p>
        </div>
        {sparkline && sparkline.length > 2 && (
          <MiniSparkline data={sparkline} positive={isPositive} />
        )}
      </div>
    </Card>
  );
});

export function LiveQuotesBar({ quotes, sparklines }: LiveQuotesBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (quotes.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--success))] animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Рынок
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin"
        data-testid="live-quotes-bar"
      >
        {quotes.map((quote) => (
          <QuoteCard
            key={quote.symbol}
            quote={quote}
            sparkline={sparklines.get(quote.symbol)}
          />
        ))}
      </div>
    </div>
  );
}
