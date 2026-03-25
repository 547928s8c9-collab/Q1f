import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TIER_META, type RiskTierKey, computeTierStats } from "@/components/strategy/tier-card";
import { StrategyDetailsSheet } from "@/components/strategy/strategy-details-sheet";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { TrendingUp, AlertTriangle, ChevronRight, Shield, Zap } from "lucide-react";
import { type Strategy, type StrategyPerformance, type BootstrapResponse, formatMoney } from "@shared/schema";
import { cn } from "@/lib/utils";

const TIER_ORDER: RiskTierKey[] = ["LOW", "CORE", "HIGH"];

const TIER_ICONS: Record<RiskTierKey, React.ElementType> = {
  LOW: Shield,
  CORE: TrendingUp,
  HIGH: Zap,
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
  const [selectedTier, setSelectedTier] = useState<RiskTierKey | null>(null);
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

  const activeInvestments = analytics?.strategies?.filter(
    (s) => BigInt(s.allocatedMinor || "0") > 0n
  );
  const hasActiveInvestment = activeInvestments && activeInvestments.length > 0;

  // Compute totals for portfolio card
  const totalAllocated = activeInvestments?.reduce(
    (sum, inv) => sum + BigInt(inv.allocatedMinor || "0"), 0n
  ) ?? 0n;
  const totalCurrent = activeInvestments?.reduce(
    (sum, inv) => sum + BigInt(inv.currentMinor || inv.allocatedMinor || "0"), 0n
  ) ?? 0n;
  const totalPnl = activeInvestments?.reduce(
    (sum, inv) => sum + BigInt(inv.pnlMinor || "0"), 0n
  ) ?? 0n;
  const totalRoiPct = totalAllocated > 0n
    ? Number(totalPnl * 10000n / totalAllocated) / 100
    : 0;

  // Group investments by tier for distribution bars
  const investmentsByTier: Record<RiskTierKey, bigint> = { LOW: 0n, CORE: 0n, HIGH: 0n };
  activeInvestments?.forEach((inv) => {
    const tier = (inv.riskTier || "CORE") as RiskTierKey;
    investmentsByTier[tier] += BigInt(inv.allocatedMinor || "0");
  });

  const handleViewDetails = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setSelectedTier(null);
    setDetailsOpen(true);
  };

  const handleViewTierDetails = (tierKey: RiskTierKey) => {
    setSelectedTier(tierKey);
    const tierStrategies = strategiesByTier[tierKey];
    if (tierStrategies.length > 0) {
      setSelectedStrategy(tierStrategies[0]);
    }
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
      setTimeout(() => {
        setSelectedStrategy(null);
        setSelectedTier(null);
      }, 300);
    }
  };

  const handleInvestOpenChange = (open: boolean) => {
    setInvestOpen(open);
    if (!open) {
      setTimeout(() => setSelectedStrategy(null), 300);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24" style={{ backgroundColor: "#F5F5F7" }}>

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-white p-6" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <Skeleton className="h-6 w-32 mb-3" />
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-6"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <Skeleton className="h-6 w-40 mb-3" />
              <Skeleton className="h-10 w-32 mb-2" />
              <Skeleton className="h-4 w-48 mb-4" />
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
        <div className="flex flex-col gap-4">
          {/* Portfolio Summary Card */}
          {hasActiveInvestment && (
            <div
              className="rounded-2xl bg-white p-6 cursor-pointer active:scale-[0.98] transition-transform duration-100"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
              onClick={() => {
                if (activeInvestments.length > 0) {
                  const strat = strategies?.find((s) => s.id === activeInvestments[0].strategyId);
                  if (strat) handleViewDetails(strat);
                }
              }}
              role="button"
              tabIndex={0}
              data-testid="portfolio-summary-card"
            >
              <p className="text-muted-foreground mb-2" style={{ fontSize: 13 }}>
                Ваши инвестиции
              </p>
              <div className="flex items-baseline justify-between mb-1">
                <p className="tabular-nums" style={{ fontSize: 28, fontWeight: 700, color: "#1D1D1F" }}>
                  {formatMoney(totalCurrent.toString(), "USDT")} <span style={{ fontSize: 15, fontWeight: 400, color: "#86868B" }}>USDT</span>
                </p>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    totalPnl >= 0n ? "text-[#34C759]" : "text-[#FF3B30]"
                  )}
                  style={{ fontSize: 15 }}
                >
                  {totalPnl >= 0n ? "+" : ""}{totalRoiPct.toFixed(1)}%
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#86868B" }} className="mb-4">
                в {activeInvestments.length} стратеги{activeInvestments.length === 1 ? "и" : "ях"}
              </p>

              {/* Distribution bars */}
              <div className="border-t pt-4 space-y-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                {TIER_ORDER.filter((t) => investmentsByTier[t] > 0n).map((tierKey) => {
                  const meta = TIER_META[tierKey];
                  const amount = investmentsByTier[tierKey];
                  const pct = totalAllocated > 0n ? Number(amount * 100n / totalAllocated) : 0;
                  return (
                    <div key={tierKey} className="flex items-center gap-3">
                      <span style={{ fontSize: 13, color: "#86868B", width: 100 }}>{meta.name}</span>
                      <span className="tabular-nums" style={{ fontSize: 13, color: "#1D1D1F", width: 80 }}>
                        {formatMoney(amount.toString(), "USDT")}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-[#F5F5F7] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.max(pct, 4)}%`, opacity: tierKey === "LOW" ? 0.5 : tierKey === "CORE" ? 0.75 : 1 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-1 mt-4" style={{ color: "hsl(var(--primary))" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Подробнее</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          )}

          {/* Section Title */}
          <p style={{ fontSize: 13, color: "#86868B", marginTop: 4 }}>
            Выберите стратегию
          </p>

          {/* Tier Cards - Apple Style */}
          {activeTiers.map((tierKey, index) => {
            const meta = TIER_META[tierKey];
            const stats = computeTierStats(strategiesByTier[tierKey]);
            const Icon = TIER_ICONS[tierKey];

            return (
              <div
                key={tierKey}
                className="rounded-2xl bg-white p-6 active:scale-[0.98] transition-transform duration-100"
                style={{
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  animationDelay: `${index * 50}ms`,
                }}
                data-testid={`tier-card-${tierKey.toLowerCase()}`}
              >
                {/* Icon + Name */}
                <div className="flex items-center gap-3 mb-4">
                  <Icon className="w-5 h-5" style={{ color: "#86868B" }} strokeWidth={1.5} />
                  <span style={{ fontSize: 17, fontWeight: 600, color: "#1D1D1F" }}>
                    {meta.name}
                  </span>
                </div>

                {/* Return - hero number */}
                <p
                  className="tabular-nums"
                  style={{ fontSize: 34, fontWeight: 700, color: "#1D1D1F", lineHeight: 1.1 }}
                >
                  {stats.returnRangeMin}–{stats.returnRangeMax}%
                </p>
                <p style={{ fontSize: 13, color: "#86868B", marginTop: 4, marginBottom: 4 }}>
                  в месяц
                </p>

                {/* Drawdown line */}
                <p style={{ fontSize: 13, color: "#86868B", marginBottom: 20 }}>
                  Просадка до {stats.maxDrawdown}
                </p>

                {/* Invest Button - always primary blue */}
                <Button
                  className="w-full font-semibold text-white"
                  style={{
                    height: 50,
                    borderRadius: 12,
                    backgroundColor: "hsl(var(--primary))",
                    fontSize: 15,
                  }}
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
        tierKey={selectedTier}
        strategies={strategies || []}
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
