import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { StrategyDetailsSheet } from "@/components/strategy/strategy-details-sheet";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { StrategyCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { TrendingUp } from "lucide-react";
import { type Strategy, type StrategyPerformance, type BootstrapResponse } from "@shared/schema";

export default function Invest() {
  useSetPageTitle("Invest");
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);

  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
    staleTime: 60_000,
  });

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: allPerformance } = useQuery<Record<string, StrategyPerformance[]>>({
    queryKey: ["/api/strategies/performance-all"],
    enabled: !isLoading && !!strategies?.length,
    staleTime: 60_000,
  });

  const lowRisk = useMemo(() => strategies?.filter(s => s.riskTier === "LOW") || [], [strategies]);
  const coreRisk = useMemo(() => strategies?.filter(s => s.riskTier === "CORE") || [], [strategies]);
  const highRisk = useMemo(() => strategies?.filter(s => s.riskTier === "HIGH") || [], [strategies]);

  const sparklineById = useMemo<Record<string, { value: number }[] | undefined>>(() => {
    if (!allPerformance) return {};
    return Object.fromEntries(
      Object.entries(allPerformance).map(([strategyId, perf]) => {
        if (!perf || perf.length === 0) return [strategyId, undefined];
        const last30 = perf.slice(-30).map((point) => ({ value: parseFloat(point.equityMinor) }));
        return [strategyId, last30];
      })
    );
  }, [allPerformance]);

  const getSparklineData = useCallback((strategyId: string) => {
    return sparklineById[strategyId];
  }, [sparklineById]);

  const handleViewDetails = useCallback((strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setDetailsOpen(true);
  }, []);

  const handleInvest = useCallback((strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setInvestOpen(true);
  }, []);

  const handleInvestFromSheet = useCallback(() => {
    setDetailsOpen(false);
    setTimeout(() => setInvestOpen(true), 150);
  }, []);

  const handleDetailsOpenChange = useCallback((open: boolean) => {
    setDetailsOpen(open);
    if (!open) {
      setTimeout(() => setSelectedStrategy(null), 300);
    }
  }, []);

  const handleInvestOpenChange = useCallback((open: boolean) => {
    setInvestOpen(open);
    if (!open) {
      setTimeout(() => setSelectedStrategy(null), 300);
    }
  }, []);

  const renderStrategyGrid = useCallback((strategyList: Strategy[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {strategyList.map((strategy) => (
        <StrategyCard 
          key={strategy.id} 
          strategy={strategy}
          sparklineData={getSparklineData(strategy.id)}
          onViewDetails={() => handleViewDetails(strategy)}
          onInvest={() => handleInvest(strategy)}
        />
      ))}
    </div>
  ), [getSparklineData, handleViewDetails, handleInvest]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Investment Strategies"
        subtitle="Choose a strategy that matches your risk profile"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StrategyCardSkeleton />
          <StrategyCardSkeleton />
          <StrategyCardSkeleton />
          <StrategyCardSkeleton />
        </div>
      ) : strategies && strategies.length > 0 ? (
        <div className="space-y-8">
          {lowRisk.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-positive"></span>
                Low Risk Strategies
              </h2>
              {renderStrategyGrid(lowRisk)}
            </section>
          )}
          
          {coreRisk.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-warning"></span>
                Core Strategies
              </h2>
              {renderStrategyGrid(coreRisk)}
            </section>
          )}
          
          {highRisk.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-negative"></span>
                High Risk Strategies
              </h2>
              {renderStrategyGrid(highRisk)}
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="No strategies available"
          description="Check back later for investment opportunities."
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
