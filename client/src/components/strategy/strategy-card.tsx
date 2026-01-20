import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Sparkline } from "@/components/charts/sparkline";
import { Money } from "@/components/ui/money";
import { TrendingUp, Shield, Zap, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy } from "@shared/schema";
import { useLiveMetrics, type LiveStrategyMetrics } from "@/hooks/use-live-metrics";
import { formatMoney } from "@shared/schema";

interface StrategyCardProps {
  strategy: Strategy;
  sparklineData?: Array<{ value: number }>;
  onInvest?: () => void;
  onViewDetails?: () => void;
  liveMetrics?: LiveStrategyMetrics;
}

const riskConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger"; icon: React.ElementType; label: string }> = {
  LOW: { color: "bg-positive/10 text-positive", chipVariant: "success", icon: Shield, label: "Low Risk" },
  CORE: { color: "bg-warning/10 text-warning", chipVariant: "warning", icon: TrendingUp, label: "Core Risk" },
  HIGH: { color: "bg-negative/10 text-negative", chipVariant: "danger", icon: Zap, label: "High Risk" },
};

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}

export function StrategyCard({ strategy, sparklineData, onInvest, onViewDetails, liveMetrics }: StrategyCardProps) {
  const tier = strategy.riskTier || "CORE";
  const config = riskConfig[tier] || riskConfig.CORE;
  const Icon = config.icon;
  
  const minReturn = strategy.expectedMonthlyRangeBpsMin ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1) : "0";
  const maxReturn = strategy.expectedMonthlyRangeBpsMax ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1) : "0";
  const minInvestment = toMajorUnits(strategy.minInvestment || "100000000", 6);

  const hasSparkline = sparklineData && sparklineData.length > 0;
  const isPositive = hasSparkline 
    ? sparklineData[sparklineData.length - 1].value >= sparklineData[0].value
    : true;

  // Live metrics
  const hasLiveMetrics = !!liveMetrics;
  const equity = liveMetrics?.equityMinor || "0";
  const pnl = liveMetrics?.pnlMinor || "0";
  const roi30dBps = liveMetrics?.roi30dBps || 0;
  const maxDrawdown30dBps = liveMetrics?.maxDrawdown30dBps || 0;
  const trades24h = liveMetrics?.trades24h || 0;
  const state = liveMetrics?.state || "NOT_INVESTED";
  
  const pnlBigInt = BigInt(pnl);
  const isProfitable = pnlBigInt >= 0n;

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails();
    }
  };

  const handleInvestClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInvest) {
      onInvest();
    }
  };

  return (
    <Card
      className="p-5 hover-elevate cursor-pointer transition-all border border-card-border hover:border-primary/30"
      data-testid={`strategy-card-${strategy.id}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleCardClick()}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn("w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0", config.color)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground truncate">{strategy.name}</h3>
            <Chip variant={config.chipVariant} size="sm" className="mt-1">
              {config.label}
            </Chip>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </div>

      {strategy.description && (
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {strategy.description}
        </p>
      )}

      {hasSparkline && (
        <div className="mb-4 bg-muted/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">30-Day Performance</span>
            <span className={cn("text-xs font-medium tabular-nums", isPositive ? "text-positive" : "text-negative")}>
              {isPositive ? "+" : ""}{((sparklineData[sparklineData.length - 1].value / sparklineData[0].value - 1) * 100).toFixed(1)}%
            </span>
          </div>
          <Sparkline data={sparklineData} positive={isPositive} height={32} />
        </div>
      )}

      {hasLiveMetrics ? (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Equity</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatMoney(equity, "USDT")}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">PnL</p>
            <p className={cn("text-sm font-semibold tabular-nums", isProfitable ? "text-positive" : "text-negative")}>
              {isProfitable ? "+" : ""}{formatMoney(pnl, "USDT")}
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">30d ROI</p>
            <p className={cn("text-sm font-semibold tabular-nums", roi30dBps >= 0 ? "text-positive" : "text-negative")}>
              {roi30dBps >= 0 ? "+" : ""}{(roi30dBps / 100).toFixed(2)}%
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Trades 24h</p>
            <p className="text-sm font-semibold tabular-nums">
              {trades24h}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Expected Return</p>
            <p className="text-sm font-semibold text-positive tabular-nums">
              {minReturn}% - {maxReturn}%
              <span className="text-xs text-muted-foreground font-normal">/mo</span>
            </p>
          </div>
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Min Investment</p>
            <p className="text-sm font-semibold tabular-nums">
              {minInvestment.toLocaleString()} USDT
            </p>
          </div>
        </div>
      )}

      {hasLiveMetrics && (
        <div className="mb-4 flex items-center gap-2">
          <Badge 
            variant={state === "INVESTED_ACTIVE" ? "default" : state === "PAUSED" ? "secondary" : "outline"}
            className="text-xs"
          >
            {state === "INVESTED_ACTIVE" ? "ACTIVE" : state === "PAUSED" ? "PAUSED" : "NOT_INVESTED"}
          </Badge>
          {maxDrawdown30dBps > 0 && (
            <span className="text-xs text-muted-foreground">
              Max DD: {(maxDrawdown30dBps / 100).toFixed(2)}%
            </span>
          )}
        </div>
      )}

      <Button 
        className="w-full" 
        onClick={handleInvestClick}
        data-testid={`button-invest-${strategy.id}`}
      >
        Invest
      </Button>
    </Card>
  );
}
