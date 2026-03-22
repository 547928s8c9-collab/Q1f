import { memo, useRef, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MarketTrade } from "@/hooks/use-market-stream";
import { Activity } from "lucide-react";

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(5);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAmount(amount: number, price: number): string {
  if (price >= 1000) return amount.toFixed(5);
  if (price >= 1) return amount.toFixed(2);
  return amount.toFixed(0);
}

const TradeRow = memo(function TradeRow({ trade, isNew }: { trade: MarketTrade; isNew: boolean }) {
  const [animate, setAnimate] = useState(isNew);
  const shortName = trade.pair.split("/")[0];

  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setAnimate(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 px-2 rounded text-xs transition-all duration-300",
        animate && "trade-slide-in",
        trade.side === "BUY" ? "hover:bg-[hsl(var(--success))]/5" : "hover:bg-[hsl(var(--danger))]/5"
      )}
      data-testid={`trade-row-${trade.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 font-bold shrink-0",
            trade.side === "BUY"
              ? "border-[hsl(var(--success))]/30 text-[hsl(var(--success))]"
              : "border-[hsl(var(--danger))]/30 text-[hsl(var(--danger))]"
          )}
        >
          {trade.side === "BUY" ? "ПОКУПКА" : "ПРОДАЖА"}
        </Badge>
        <span className="font-semibold truncate">{shortName}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular-nums font-medium">{formatPrice(trade.price)}</span>
        <span className="tabular-nums text-muted-foreground w-16 text-right">
          {formatAmount(trade.amount, trade.price)}
        </span>
        <span className="text-muted-foreground w-14 text-right">{formatTime(trade.ts)}</span>
      </div>
    </div>
  );
});

interface LiveTradeFeedProps {
  trades: MarketTrade[];
  maxItems?: number;
}

export function LiveTradeFeed({ trades, maxItems = 15 }: LiveTradeFeedProps) {
  const prevNewestIdRef = useRef<string | null>(null);
  const visibleTrades = trades.slice(0, maxItems);

  const newestId = trades.length > 0 ? trades[0].id : null;
  const newIds = new Set<string>();

  if (newestId && newestId !== prevNewestIdRef.current) {
    for (const t of visibleTrades) {
      if (t.id === prevNewestIdRef.current) break;
      newIds.add(t.id);
    }
  }

  useEffect(() => {
    if (newestId) {
      prevNewestIdRef.current = newestId;
    }
  }, [newestId]);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Трейд-лог</span>
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {trades.length} сделок
        </span>
      </div>
      <div className="space-y-0.5 max-h-[360px] overflow-y-auto scrollbar-thin">
        {visibleTrades.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            Ожидание сделок...
          </div>
        ) : (
          visibleTrades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} isNew={newIds.has(trade.id)} />
          ))
        )}
      </div>
    </Card>
  );
}
