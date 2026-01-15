import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy } from "@shared/schema";

interface StrategyCardProps {
  strategy: Strategy;
}

const riskColors: Record<string, string> = {
  low: "bg-positive/10 text-positive border-positive/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  high: "bg-negative/10 text-negative border-negative/20",
};

export function StrategyCard({ strategy }: StrategyCardProps) {
  return (
    <Link href={`/invest/${strategy.id}`}>
      <Card
        className="p-5 hover-elevate cursor-pointer transition-all border border-card-border hover:border-primary/30"
        data-testid={`strategy-card-${strategy.id}`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{strategy.name}</h3>
              <Badge
                variant="outline"
                className={cn("text-xs mt-1", riskColors[strategy.riskLevel])}
              >
                {strategy.riskLevel.charAt(0).toUpperCase() + strategy.riskLevel.slice(1)} Risk
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Expected Return</p>
            <p className="text-lg font-semibold text-positive tabular-nums">
              +{strategy.expectedReturn}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Max Drawdown</p>
            <p className="text-lg font-semibold text-negative tabular-nums">
              -{strategy.maxDrawdown}%
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
