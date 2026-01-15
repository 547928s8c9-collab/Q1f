import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ChevronRight, AlertTriangle, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy } from "@shared/schema";

interface StrategyCardProps {
  strategy: Strategy;
}

const riskConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  LOW: { color: "bg-positive/10 text-positive border-positive/20", icon: Shield, label: "Low Risk" },
  CORE: { color: "bg-warning/10 text-warning border-warning/20", icon: TrendingUp, label: "Core" },
  HIGH: { color: "bg-negative/10 text-negative border-negative/20", icon: Zap, label: "High Risk" },
};

export function StrategyCard({ strategy }: StrategyCardProps) {
  const tier = strategy.riskTier || "CORE";
  const config = riskConfig[tier] || riskConfig.CORE;
  const Icon = config.icon;
  
  const minReturn = strategy.expectedMonthlyRangeBpsMin ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1) : "0";
  const maxReturn = strategy.expectedMonthlyRangeBpsMax ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1) : "0";

  return (
    <Link href={`/invest/${strategy.id}`}>
      <Card
        className="p-5 hover-elevate cursor-pointer transition-all border border-card-border hover:border-primary/30"
        data-testid={`strategy-card-${strategy.id}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", 
              tier === "LOW" ? "bg-positive/10" : tier === "HIGH" ? "bg-negative/10" : "bg-primary/10"
            )}>
              <Icon className={cn("w-5 h-5", 
                tier === "LOW" ? "text-positive" : tier === "HIGH" ? "text-negative" : "text-primary"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{strategy.name}</h3>
              <Badge
                variant="outline"
                className={cn("text-xs mt-1", config.color)}
              >
                {config.label}
              </Badge>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </div>

        {strategy.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {strategy.description}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Range</p>
            <p className="text-sm font-semibold text-positive tabular-nums">
              {minReturn}% - {maxReturn}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Worst Month</p>
            <p className="text-sm font-semibold text-negative tabular-nums">
              {strategy.worstMonth || "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Max DD</p>
            <p className="text-sm font-semibold text-negative tabular-nums">
              {strategy.maxDrawdown || "N/A"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <AlertTriangle className="w-3 h-3 text-warning" />
          <span className="text-xs text-muted-foreground">DEMO - Past performance is not indicative of future results</span>
        </div>
      </Card>
    </Link>
  );
}
