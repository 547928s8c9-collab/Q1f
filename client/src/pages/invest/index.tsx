import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { StrategyCard } from "@/components/strategy/strategy-card";
import { StrategyCardSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";
import { type Strategy } from "@shared/schema";

export default function Invest() {
  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Invest"
        subtitle="Explore and invest in trading strategies"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StrategyCardSkeleton />
          <StrategyCardSkeleton />
        </div>
      ) : strategies && strategies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategies.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
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
