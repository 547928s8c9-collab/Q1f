import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { TierCard, type RiskTierKey } from "@/components/strategy/tier-card";
import { StrategyDetailsSheet } from "@/components/strategy/strategy-details-sheet";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { LiveBadge } from "@/components/ui/live-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { useEngineStream } from "@/hooks/use-engine-stream";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { type Strategy, type StrategyPerformance, type BootstrapResponse } from "@shared/schema";
import { InvestmentCalculator } from "@/components/investment-calculator";

const TIER_ORDER: RiskTierKey[] = ["LOW", "CORE", "HIGH"];

export default function Invest() {
  useSetPageTitle("Инвестиции");
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);

  const { status: engineStatus, lastUpdated, isRunning } = useEngineStream();
  const { metrics: liveMetrics, getMetrics } = useLiveMetrics();

  const { data: strategies, isLoading, isError } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: allPerformance } = useQuery<Record<string, StrategyPerformance[]>>({
    queryKey: ["/api/strategies/performance-all"],
    enabled: !isLoading && !!strategies?.length,
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

  const handleViewDetails = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setDetailsOpen(true);
  };

  const handleInvest = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setInvestOpen(true);
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
        title="Инвестиционные стратегии"
        subtitle="Выберите уровень риска, соответствующий вашим целям"
        badge={
          <LiveBadge
            pulse={isRunning}
          />
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-28 w-full" />
              <div className="p-6 space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Не удалось загрузить стратегии"
          description="Не удалось получить инвестиционные стратегии. Обновите страницу или попробуйте позже."
        />
      ) : activeTiers.length > 0 ? (
        <div className="space-y-6">
          {activeTiers.map((tierKey) => (
            <TierCard
              key={tierKey}
              tierKey={tierKey}
              strategies={strategiesByTier[tierKey]}
              allPerformance={allPerformance}
              getMetrics={getMetrics}
              onInvest={handleInvest}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="Нет доступных стратегий"
          description="Загляните позже — скоро появятся инвестиционные возможности."
        />
      )}

      {!isLoading && <InvestmentCalculator />}

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
