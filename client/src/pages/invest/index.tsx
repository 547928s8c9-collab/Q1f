import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { StrategyDetailsSheet } from "@/components/strategy/strategy-details-sheet";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { StrategyCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { type Strategy, type StrategyPerformance, type BootstrapResponse } from "@shared/schema";

export default function Invest() {
  useSetPageTitle("Invest");
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [investOpen, setInvestOpen] = useState(false);

  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: allPerformance } = useQuery<Record<string, StrategyPerformance[]>>({
    queryKey: ["/api/strategies/performance-all"],
    enabled: !isLoading && !!strategies?.length,
  });

  const lowRisk = strategies?.filter(s => s.riskTier === "LOW") || [];
  const coreRisk = strategies?.filter(s => s.riskTier === "CORE") || [];
  const highRisk = strategies?.filter(s => s.riskTier === "HIGH") || [];

  const getSparklineData = (strategyId: string) => {
    const perf = allPerformance?.[strategyId];
    if (!perf || perf.length === 0) return undefined;
    
    const last30 = perf.slice(-30);
    return last30.map(p => ({ value: parseFloat(p.equityMinor) }));
  };

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

  const renderStrategyGrid = (strategyList: Strategy[]) => (
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
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Investment Strategies"
        subtitle="Choose a strategy that matches your risk profile"
      />

      <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-6 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
        <span className="text-sm text-warning">DEMO MODE - All performance data is simulated. Past results do not guarantee future returns.</span>
      </div>

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
