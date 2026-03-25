import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy } from "@shared/schema";

export type RiskTierKey = "LOW" | "CORE" | "HIGH";
export type RiskTier = RiskTierKey;

export interface TierMeta {
  key: RiskTierKey;
  name: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  chipVariant: "success" | "warning" | "danger";
  iconColor: string;
  bgGradient: string;
  buttonColor: string;
}

export const TIER_META: Record<RiskTierKey, TierMeta> = {
  LOW: {
    key: "LOW",
    name: "Стабильный",
    tagline: "Стабильная доходность, минимальная волатильность",
    description:
      "Защитные стратегии, работающие в режимах низкой волатильности и нацеленные на небольшую, но стабильную прибыль. Идеально для сохранения капитала с умеренным ростом.",
    icon: Shield,
    chipVariant: "success",
    iconColor: "text-positive",
    bgGradient: "from-positive/5 to-positive/10",
    buttonColor: "bg-positive hover:bg-positive/90 text-white",
  },
  CORE: {
    key: "CORE",
    name: "Активный",
    tagline: "Диверсифицированная экспозиция, умеренный риск",
    description:
      "Сочетание трендовых и контртрендовых стратегий по нескольким активам. Основа сбалансированного портфеля.",
    icon: TrendingUp,
    chipVariant: "warning",
    iconColor: "text-primary",
    bgGradient: "from-primary/5 to-primary/10",
    buttonColor: "bg-primary hover:bg-primary/90 text-white",
  },
  HIGH: {
    key: "HIGH",
    name: "Агрессивный",
    tagline: "Высокий потенциал, высокая волатильность",
    description:
      "Стратегии на основе моментума и пробоев, улавливающие быстрые рыночные движения. Подходит инвесторам, готовым к крупным просадкам ради повышенной доходности.",
    icon: Zap,
    chipVariant: "danger",
    iconColor: "text-warning",
    bgGradient: "from-warning/5 to-warning/10",
    buttonColor: "bg-warning hover:bg-warning/90 text-white",
  },
};

interface TierStats {
  returnRangeMin: string;
  returnRangeMax: string;
  maxDrawdown: string;
  strategyCount: number;
  pairs: string[];
}

export function computeTierStats(strategies: Strategy[]): TierStats {
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
  isActive?: boolean;
  onInvest: (strategy: Strategy) => void;
}

export function TierCard({
  tierKey,
  strategies,
  isActive,
  onInvest,
}: TierCardProps) {
  const meta = TIER_META[tierKey];
  const stats = computeTierStats(strategies);
  const Icon = meta.icon;

  return (
    <Card
      className={cn(
        "overflow-hidden border border-black/[0.06] rounded-2xl bg-white dark:bg-card",
        isActive && "ring-2 ring-primary"
      )}
      data-testid={`tier-card-${tierKey.toLowerCase()}`}
    >
      <div className="p-5">
        {/* Header: icon + name + badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center bg-muted/60"
              )}
            >
              <Icon className={cn("w-5 h-5", meta.iconColor)} />
            </div>
            <h2 className="text-lg font-bold text-foreground">{meta.name}</h2>
          </div>
          <Chip variant={meta.chipVariant} size="sm">
            {tierKey}
          </Chip>
        </div>

        {/* Main metric: target return */}
        <p className="text-2xl font-bold text-foreground tabular-nums mb-3">
          {stats.returnRangeMin}–{stats.returnRangeMax}%{" "}
          <span className="text-base font-normal text-muted-foreground">/мес</span>
        </p>

        {/* Secondary info row */}
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-5">
          <span>
            Просадка до{" "}
            <span className="font-medium text-foreground tabular-nums">
              {stats.maxDrawdown}
            </span>
          </span>
          <span>
            <span className="font-medium text-foreground tabular-nums">
              {stats.strategyCount}
            </span>{" "}
            {stats.strategyCount === 1 ? "стратегия" : stats.strategyCount < 5 ? "стратегии" : "стратегий"}
          </span>
        </div>

        {/* Active badge */}
        {isActive && (
          <div className="mb-4">
            <Chip variant="primary" size="sm">
              Активна
            </Chip>
          </div>
        )}

        {/* CTA button */}
        <Button
          className={cn("w-full h-12 rounded-xl text-base font-semibold", meta.buttonColor)}
          onClick={() => {
            if (strategies.length > 0) {
              onInvest(strategies[0]);
            }
          }}
          data-testid={`button-invest-tier-${tierKey.toLowerCase()}`}
        >
          Инвестировать
        </Button>
      </div>
    </Card>
  );
}
