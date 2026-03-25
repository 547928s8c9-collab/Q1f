import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TierCard, type RiskTierKey } from "@/components/strategy/tier-card";
import { StrategyDetailsSheet } from "@/components/strategy/strategy-details-sheet";
import { InvestSheet } from "@/components/operations/invest-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { TrendingUp, AlertTriangle } from "lucide-react";
import { type Strategy, type BootstrapResponse, formatMoney } from "@shared/schema";

const TIER_ORDER: RiskTierKey[] = ["LOW", "CORE", "HIGH"];

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

  const hasActiveInvestment = bootstrap
    ? BigInt(bootstrap.invested?.current || "0") > 0n
    : false;

  const investedPnl = bootstrap
    ? (BigInt(bootstrap.invested?.current || "0") - BigInt(bootstrap.invested?.principal || "0")).toString()
    : "0";

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
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Стратегии</h1>
        <p className="text-sm text-muted-foreground mt-1">Выберите уровень риска</p>
      </div>

      {/* Active investment section */}
      {hasActiveInvestment && bootstrap && (
        <div className="mb-6 p-4 rounded-2xl border border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ваша стратегия</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatMoney(bootstrap.invested.current, "USDT")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">PnL</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  BigInt(investedPnl) >= 0n ? "text-positive" : "text-negative"
                }`}
              >
                {BigInt(investedPnl) >= 0n ? "+" : ""}
                {formatMoney(investedPnl, "USDT")}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-black/[0.06] p-5">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-8 w-40 mb-3" />
              <Skeleton className="h-4 w-full mb-5" />
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
        <div className="space-y-3">
          {activeTiers.map((tierKey) => (
            <TierCard
              key={tierKey}
              tierKey={tierKey}
              strategies={strategiesByTier[tierKey]}
              isActive={false}
              onInvest={handleInvest}
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
