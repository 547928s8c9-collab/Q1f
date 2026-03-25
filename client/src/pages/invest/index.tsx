import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { TIER_META, type RiskTierKey, computeTierStats } from "@/components/strategy/tier-card";
import { StrategyDetailsSheet } from "@/components/strategy/strategy-details-sheet";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { TrendingUp, AlertTriangle, ChevronRight } from "lucide-react";
import { type Strategy, type StrategyPerformance, type BootstrapResponse, formatMoney } from "@shared/schema";
import { cn } from "@/lib/utils";

const TIER_ORDER: RiskTierKey[] = ["LOW", "CORE", "HIGH"];

const BUTTON_COLORS: Record<RiskTierKey, string> = {
  LOW: "bg-positive hover:bg-positive/90 text-white",
  CORE: "bg-primary hover:bg-primary/90 text-white",
  HIGH: "bg-warning hover:bg-warning/90 text-white",
};

interface AnalyticsOverview {
  strategies: Array<{
    strategyId: string;
    name: string;
    riskTier: string;
    allocatedMinor: string;
    currentMinor: string;
    pnlMinor: string;
    roiPct: number;
  }>;
}

export default function Invest() {
  useSetPageTitle("Стратегии");
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);

  const { data: strategies, isLoading, isError } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    refetchInterval: 15_000,
  });

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
    refetchInterval: 15_000,
  });

  const { data: analytics } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
    refetchInterval: 15_000,
  });

  const strategiesByTier: Record<RiskTierKey, Strategy[]> = {
    LOW: [],
    CORE: [],
    HIGH: [],
  };

  strategies?.forEach((s) => {
    const tier = (s.riskTier || "CORE") as RiskTierKey;
    if (strategiesByTier[tier]) {
      strategiesByTier[tier].push(s);
    }
  });

  const activeTiers = TIER_ORDER.filter(
    (tier) => strategiesByTier[tier].length > 0
  );

  // Check if user has active investments
  const activeInvestments = analytics?.strategies?.filter(
    (s) => BigInt(s.allocatedMinor || "0") > 0n
  );
  const hasActiveInvestment = activeInvestments && activeInvestments.length > 0;

  const handleViewDetails = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setDetailsOpen(true);
  };

  const handleInvest = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setInvestOpen(true);
  };

  const handleInvestTier = (tierKey: RiskTierKey) => {
    const tierStrategies = strategiesByTier[tierKey];
    if (tierStrategies.length > 0) {
      setSelectedStrategy(tierStrategies[0]);
      setInvestOpen(true);
    }
  };

  const handleInvestFromSheet = () => {
    setDetailsOpen(false);
    setTimeout(() => setInvestOpen(true), 150);
  };

  const handleDetailsOpenChange = (open: boolean) => {
    setDetailsOpen(open);
    if (!open) {
      setTimeout(() => setSelectedStrategy(null), 300);
    }
  };

  const handleInvestOpenChange = (open: boolean) => {
    setInvestOpen(open);
    if (!open) {
      setTimeout(() => setSelectedStrategy(null), 300);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Стратегии"
        subtitle="Выберите уровень риска"
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-black/[0.06] p-5"
            >
              <Skeleton className="h-6 w-40 mb-3" />
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-48 mb-3" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Не удалось загрузить стратегии"
          description="Обновите страницу или попробуйте позже."
        />
      ) : activeTiers.length > 0 ? (
        <div className="flex flex-col gap-3">
          {/* Active investment section */}
          {hasActiveInvestment && (
            <div className="mb-1">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                Ваша стратегия
              </h2>
              {activeInvestments.map((inv) => {
                const pnl = BigInt(inv.pnlMinor || "0");
                const isPositive = pnl >= 0n;
                const tierKey = (inv.riskTier || "CORE") as RiskTierKey;
                const meta = TIER_META[tierKey];

                return (
                  <div
                    key={inv.strategyId}
                    className="rounded-2xl border border-primary/30 bg-white p-4 mb-2 flex items-center justify-between border-l-4 border-l-primary cursor-pointer"
                    onClick={() => {
                      const strat = strategies?.find((s) => s.id === inv.strategyId);
                      if (strat) handleViewDetails(strat);
                    }}
                    role="button"
                    tabIndex={0}
                    data-testid={`active-investment-${inv.strategyId}`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground">
                        {inv.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>
                          Вложено: {formatMoney(inv.allocatedMinor, "USDT")} USDT
                        </span>
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            isPositive ? "text-positive" : "text-negative"
                          )}
                        >
                          PnL: {isPositive ? "+" : ""}{inv.roiPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Tier cards */}
          {activeTiers.map((tierKey) => {
            const meta = TIER_META[tierKey];
            const stats = computeTierStats(strategiesByTier[tierKey]);
            const Icon = meta.icon;

            return (
              <div
                key={tierKey}
                className="rounded-2xl bg-white p-5"
                style={{
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
                data-testid={`tier-card-${tierKey.toLowerCase()}`}
              >
                {/* Row 1: Icon + Name + Badge */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-background/80"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", meta.iconColor)} />
                  </div>
                  <span className="text-base font-bold text-foreground">
                    {meta.name}
                  </span>
                  <Chip variant={meta.chipVariant} size="sm">
                    {tierKey}
                  </Chip>
                </div>

                {/* Row 2: Target return - large */}
                <p
                  className="tabular-nums text-foreground mb-1"
                  style={{ fontSize: 24, fontWeight: 700 }}
                >
                  {stats.returnRangeMin}–{stats.returnRangeMax}%{" "}
                  <span className="text-muted-foreground" style={{ fontSize: 14, fontWeight: 400 }}>
                    /мес
                  </span>
                </p>

                {/* Row 3: Drawdown + strategy count */}
                <p
                  className="text-muted-foreground mb-4"
                  style={{ fontSize: 13 }}
                >
                  Просадка до {stats.maxDrawdown} &middot; {stats.strategyCount} стратеги{stats.strategyCount === 1 ? "я" : "и"}
                </p>

                {/* Row 4: Invest button */}
                <Button
                  className={cn("w-full font-semibold", BUTTON_COLORS[tierKey])}
                  style={{ height: 48, borderRadius: 12 }}
                  onClick={() => handleInvestTier(tierKey)}
                  data-testid={`button-invest-tier-${tierKey.toLowerCase()}`}
                >
                  Инвестировать
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="Нет доступных стратегий"
          description="Загляните позже — скоро появятся инвестиционные возможности."
        />
      )}

      <StrategyDetailsSheet
        strategy={selectedStrategy}
        open={detailsOpen}
        onOpenChange={handleDetailsOpenChange}
        onInvest={handleInvestFromSheet}
      />

      <InvestSheet
        open={investOpen}
        onOpenChange={handleInvestOpenChange}
        bootstrap={bootstrap}
        preselectedStrategyId={selectedStrategy?.id}
      />
    </div>
  );
}
