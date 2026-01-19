import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { Sparkline } from "@/components/charts/sparkline";
import { TrendingUp, Shield, Zap, AlertTriangle, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy, type StrategyPerformance } from "@shared/schema";
import { Link } from "wouter";

interface StrategyDetailsSheetProps {
  strategy: Strategy | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvest?: () => void;
}

const riskConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger"; icon: React.ElementType; label: string; description: string }> = {
  LOW: { 
    color: "bg-positive/10 text-positive", 
    chipVariant: "success", 
    icon: Shield, 
    label: "Low Risk",
    description: "Conservative approach with stable returns"
  },
  CORE: { 
    color: "bg-warning/10 text-warning", 
    chipVariant: "warning", 
    icon: TrendingUp, 
    label: "Medium Risk",
    description: "Balanced risk-reward profile"
  },
  HIGH: { 
    color: "bg-negative/10 text-negative", 
    chipVariant: "danger", 
    icon: Zap, 
    label: "High Risk",
    description: "Higher potential returns with increased volatility"
  },
};

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}

export function StrategyDetailsSheet({ 
  strategy, 
  open, 
  onOpenChange, 
  onInvest 
}: StrategyDetailsSheetProps) {
  const { data: performance } = useQuery<StrategyPerformance[]>({
    queryKey: ["/api/strategies", strategy?.id, "performance"],
    enabled: !!strategy?.id && open,
  });

  if (!strategy) return null;

  const tier = strategy.riskTier || "CORE";
  const config = riskConfig[tier] || riskConfig.CORE;
  const Icon = config.icon;

  const minReturn = strategy.expectedMonthlyRangeBpsMin ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1) : "0";
  const maxReturn = strategy.expectedMonthlyRangeBpsMax ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1) : "0";
  const minInvestment = toMajorUnits(strategy.minInvestment || "100000000", 6);

  const fees = strategy.feesJson as { management?: string; performance?: string } | null;
  const pairs = Array.isArray(strategy.pairsJson) ? strategy.pairsJson : [];

  const last30Days = (performance || []).slice(-30);
  const sparklineData = last30Days.map(p => ({
    value: parseFloat(p.equityMinor)
  }));

  const hasSparkline = sparklineData.length > 0;
  const isPositive = hasSparkline 
    ? sparklineData[sparklineData.length - 1].value >= sparklineData[0].value
    : true;
  const returnPercent = hasSparkline
    ? ((sparklineData[sparklineData.length - 1].value / sparklineData[0].value - 1) * 100)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="sr-only">{strategy.name} Details</SheetTitle>
        </SheetHeader>

        <div className="flex items-start gap-4 mb-6">
          <div className={cn("w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0", config.color)}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-foreground">{strategy.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Chip variant={config.chipVariant} size="sm">
                {config.label}
              </Chip>
            </div>
            {strategy.description && (
              <p className="text-sm text-muted-foreground mt-2">{strategy.description}</p>
            )}
          </div>
        </div>

        <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-6 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Capital is at risk and drawdowns are possible in live trading.
          </p>
        </div>

        {hasSparkline && (
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">30-Day Performance</span>
              <span className={cn("text-sm font-semibold tabular-nums", isPositive ? "text-positive" : "text-negative")}>
                {isPositive ? "+" : ""}{returnPercent.toFixed(2)}%
              </span>
            </div>
            <Sparkline data={sparklineData} positive={isPositive} height={48} />
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Expected Return</p>
            <p className="text-lg font-semibold text-positive tabular-nums">
              {minReturn}% - {maxReturn}%
              <span className="text-xs text-muted-foreground font-normal">/mo</span>
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Min Investment</p>
            <p className="text-lg font-semibold tabular-nums">
              {minInvestment.toLocaleString()} USDT
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Worst Month</p>
            <p className="text-lg font-semibold text-negative tabular-nums">
              {strategy.worstMonth || "N/A"}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Max Drawdown</p>
            <p className="text-lg font-semibold text-negative tabular-nums">
              {strategy.maxDrawdown || "N/A"}
            </p>
          </Card>
        </div>

        <Card className="p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Risk Profile</h3>
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", config.color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{config.label}</p>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Fees & Terms</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Management Fee</span>
              <span className="font-medium">{fees?.management || "0.5%"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Performance Fee</span>
              <span className="font-medium">{fees?.performance || "10%"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Profit Payout</span>
              <span className="font-medium">Daily / Monthly</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Principal Redemption</span>
              <span className="font-medium">Weekly Window</span>
            </div>
          </div>
        </Card>

        {pairs.length > 0 && (
          <Card className="p-4 mb-6">
            <h3 className="text-sm font-semibold mb-3">Trading Pairs</h3>
            <div className="flex flex-wrap gap-1.5">
              {pairs.map((pair: string) => (
                <Badge key={pair} variant="outline" className="text-xs">{pair}</Badge>
              ))}
            </div>
          </Card>
        )}

        <div className="flex items-start gap-2 text-xs text-muted-foreground mb-6 p-3 bg-muted/30 rounded-lg">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>Your capital is at risk. The value of your investment may go down as well as up.</p>
        </div>

        <div className="flex gap-3">
          <Link href={`/invest/${strategy.id}`} className="flex-1">
            <Button variant="outline" className="w-full" data-testid="button-view-full-details">
              Full Details
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Button 
            className="flex-1" 
            onClick={onInvest}
            data-testid="button-invest-sheet"
          >
            Invest Now
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
