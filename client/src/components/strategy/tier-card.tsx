import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { Sparkline } from "@/components/charts/sparkline";
import {
  Shield,
  TrendingUp,
  Zap,
  ChevronDown,
  ChevronRight,
  Info,
  Users,
} from "lucide-react";
import { platformStats } from "@/lib/platform-stats";
import { cn } from "@/lib/utils";
import { type Strategy } from "@shared/schema";
import type { LiveMetrics } from "@/hooks/use-live-metrics";

type SingleStrategyMetrics = LiveMetrics[string] | null;

export type RiskTierKey = "LOW" | "CORE" | "HIGH";

export interface TierMeta {
  key: RiskTierKey;
  name: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  chipVariant: "success" | "warning" | "danger";
  iconColor: string;
  bgGradient: string;
}

export const TIER_META: Record<RiskTierKey, TierMeta> = {
  LOW: {
    key: "LOW",
    name: "Стабильный",
    tagline: "Steady returns, minimal volatility",
    description:
      "Defensive strategies that ride low-volatility regimes and target small, consistent gains. Ideal for capital preservation with modest growth.",
    icon: Shield,
    chipVariant: "success",
    iconColor: "text-positive",
    bgGradient: "from-positive/5 to-positive/10",
  },
  CORE: {
    key: "CORE",
    name: "Активный",
    tagline: "Diversified exposure, moderate risk",
    description:
      "A blend of trend-following and mean-reversion strategies across multiple assets. The backbone of a well-rounded portfolio.",
    icon: TrendingUp,
    chipVariant: "warning",
    iconColor: "text-primary",
    bgGradient: "from-primary/5 to-primary/10",
  },
  HIGH: {
    key: "HIGH",
    name: "Агрессивный",
    tagline: "Higher potential, higher volatility",
    description:
      "Momentum and breakout strategies that capture fast market moves. Best suited for investors comfortable with larger drawdowns in exchange for outsized returns.",
    icon: Zap,
    chipVariant: "danger",
    iconColor: "text-warning",
    bgGradient: "from-warning/5 to-warning/10",
  },
};

interface TierStats {
  returnRangeMin: string;
  returnRangeMax: string;
  maxDrawdown: string;
  strategyCount: number;
  pairs: string[];
}

function computeTierStats(strategies: Strategy[]): TierStats {
  if (strategies.length === 0) {
    return {
      returnRangeMin: "0",
      returnRangeMax: "0",
      maxDrawdown: "0",
      strategyCount: 0,
      pairs: [],
    };
  }

  const minBps = Math.min(
    ...strategies.map((s) => s.expectedMonthlyRangeBpsMin || 0)
  );
  const maxBps = Math.max(
    ...strategies.map((s) => s.expectedMonthlyRangeBpsMax || 0)
  );

  const drawdowns = strategies
    .map((s) => parseFloat((s.maxDrawdown || "0%").replace("%", "")))
    .filter((d) => !isNaN(d));
  const worstDrawdown =
    drawdowns.length > 0 ? Math.min(...drawdowns) : 0;

  const allPairs = new Set<string>();
  strategies.forEach((s) => {
    const pairs = Array.isArray(s.pairsJson) ? s.pairsJson : [];
    pairs.forEach((p: string) => allPairs.add(p));
  });

  return {
    returnRangeMin: (minBps / 100).toFixed(1),
    returnRangeMax: (maxBps / 100).toFixed(1),
    maxDrawdown: `${worstDrawdown.toFixed(1)}%`,
    strategyCount: strategies.length,
    pairs: Array.from(allPairs),
  };
}

interface TierCardProps {
  tierKey: RiskTierKey;
  strategies: Strategy[];
  allPerformance?: Record<string, Array<{ equityMinor: string }>>;
  getMetrics?: (strategyId: string) => SingleStrategyMetrics;
  onInvest: (strategy: Strategy) => void;
  onViewDetails: (strategy: Strategy) => void;
}

export function TierCard({
  tierKey,
  strategies,
  allPerformance,
  getMetrics,
  onInvest,
  onViewDetails,
}: TierCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = TIER_META[tierKey];
  const stats = computeTierStats(strategies);
  const Icon = meta.icon;

  const TIER_TO_STAT: Record<RiskTierKey, { count: number; label: string }> = {
    LOW:  { count: platformStats.tierDistribution.stable.count,     label: "инвестор" },
    CORE: { count: platformStats.tierDistribution.active.count,     label: "инвестор" },
    HIGH: { count: platformStats.tierDistribution.aggressive.count, label: "инвесторов" },
  };

  return (
    <Card
      className="overflow-hidden border border-card-border"
      data-testid={`tier-card-${tierKey.toLowerCase()}`}
    >
      <div className={cn("p-6 bg-gradient-to-br", meta.bgGradient)}>
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-background/80 backdrop-blur-sm"
            )}
          >
            <Icon className={cn("w-7 h-7", meta.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-foreground">{meta.name}</h2>
              <Chip variant={meta.chipVariant} size="sm">
                {tierKey}
              </Chip>
            </div>
            <p className="text-sm text-muted-foreground">{meta.tagline}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {TIER_TO_STAT[tierKey].count.toLocaleString("ru-RU")} {TIER_TO_STAT[tierKey].label}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <p className="text-sm text-muted-foreground">{meta.description}</p>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Target Return</p>
            <p className="text-base font-bold text-positive tabular-nums">
              {stats.returnRangeMin}–{stats.returnRangeMax}%
            </p>
            <p className="text-xs text-muted-foreground">/month</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Max Drawdown</p>
            <p className="text-base font-bold text-negative tabular-nums">
              {stats.maxDrawdown}
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Strategies</p>
            <p className="text-base font-bold tabular-nums">
              {stats.strategyCount}
            </p>
            <p className="text-xs text-muted-foreground">active</p>
          </div>
        </div>

        {stats.pairs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {stats.pairs.map((pair) => (
              <Badge key={pair} variant="outline" className="text-xs">
                {pair}
              </Badge>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2 border-t border-border"
          data-testid={`toggle-strategies-${tierKey.toLowerCase()}`}
        >
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Under the Hood — {stats.strategyCount} Strategies
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {expanded && (
          <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
            {strategies.map((strategy) => {
              const minReturn = strategy.expectedMonthlyRangeBpsMin
                ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1)
                : "0";
              const maxReturn = strategy.expectedMonthlyRangeBpsMax
                ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1)
                : "0";

              const perf = allPerformance?.[strategy.id];
              const sparklineData = perf
                ?.slice(-30)
                .map((p) => ({ value: parseFloat(p.equityMinor) }));
              const hasSparkline = sparklineData && sparklineData.length > 0;
              const isPositive =
                hasSparkline &&
                sparklineData[sparklineData.length - 1].value >=
                  sparklineData[0].value;

              const live = getMetrics?.(strategy.id);

              return (
                <div
                  key={strategy.id}
                  className="border border-border rounded-lg p-4 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => onViewDetails(strategy)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" && onViewDetails(strategy)
                  }
                  data-testid={`strategy-row-${strategy.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm text-foreground">
                      {strategy.name}
                    </h4>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>

                  {strategy.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-1">
                      {strategy.description}
                    </p>
                  )}

                  {hasSparkline && (
                    <div className="mb-3">
                      <Sparkline
                        data={sparklineData}
                        positive={isPositive}
                        height={24}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Return </span>
                      <span className="font-medium text-positive tabular-nums">
                        {minReturn}–{maxReturn}%
                      </span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">DD </span>
                      <span className="font-medium text-negative tabular-nums">
                        {strategy.maxDrawdown || "N/A"}
                      </span>
                    </div>
                    {live && live.pnlMinor !== "0" && (
                      <div>
                        <span className="text-muted-foreground">PnL </span>
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            BigInt(live.pnlMinor) >= 0n
                              ? "text-positive"
                              : "text-negative"
                          )}
                        >
                          {live.roi30dBps >= 0 ? "+" : ""}{(live.roi30dBps / 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(strategy);
                      }}
                      data-testid={`button-details-${strategy.id}`}
                    >
                      Details
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInvest(strategy);
                      }}
                      data-testid={`button-invest-${strategy.id}`}
                    >
                      Invest
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          className="w-full"
          onClick={() => {
            if (strategies.length > 0) {
              onInvest(strategies[0]);
            }
          }}
          data-testid={`button-invest-tier-${tierKey.toLowerCase()}`}
        >
          Invest in {meta.name} Tier
        </Button>
      </div>
    </Card>
  );
}
