import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { StrategyCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { type Strategy } from "@shared/schema";

export default function Invest() {
  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const lowRisk = strategies?.filter(s => s.riskTier === "LOW") || [];
  const coreRisk = strategies?.filter(s => s.riskTier === "CORE") || [];
  const highRisk = strategies?.filter(s => s.riskTier === "HIGH") || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lowRisk.map((strategy) => (
                  <StrategyCard key={strategy.id} strategy={strategy} />
                ))}
              </div>
            </section>
          )}
          
          {coreRisk.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-warning"></span>
                Core Strategies
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coreRisk.map((strategy) => (
                  <StrategyCard key={strategy.id} strategy={strategy} />
                ))}
              </div>
            </section>
          )}
          
          {highRisk.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-negative"></span>
                High Risk Strategies
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {highRisk.map((strategy) => (
                  <StrategyCard key={strategy.id} strategy={strategy} />
                ))}
              </div>
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
    </div>
  );
}
