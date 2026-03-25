import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { formatMoney, type BootstrapResponse, type Strategy } from "@shared/schema";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Send, 
  TrendingUp,
  Wallet,
  Vault,
  ChevronRight,
  PiggyBank,
  Plus
} from "lucide-react";
import { DepositSheet, WithdrawSheet, TransferSheet, InvestSheet } from "@/components/operations";
import { TIER_META, type RiskTierKey } from "@/components/strategy/tier-card";
import { LiveQuotesBar } from "@/components/live-quotes-bar";
import { useMarketStream } from "@/hooks/use-market-stream";

function HeroCard({ bootstrap, isLoading }: { bootstrap?: BootstrapResponse; isLoading: boolean }) {
  const usdtBalance = bootstrap?.balances?.USDT;
  const totalPortfolio = bootstrap && usdtBalance
    ? (BigInt(usdtBalance.available || "0") + 
       BigInt(usdtBalance.locked || "0") +
       BigInt(bootstrap.invested?.current || "0")).toString()
    : "0";

  const todaySeries = bootstrap?.portfolioSeries || [];
  const yesterdayValue = todaySeries.length >= 2 ? todaySeries[todaySeries.length - 2]?.value : null;
  const todayValue = todaySeries.length >= 1 ? todaySeries[todaySeries.length - 1]?.value : null;
  const latestDate = todaySeries.length >= 1 ? todaySeries[todaySeries.length - 1]?.date : null;

  let dailyChange = "0";
  let dailyChangePercent = "0.00";
  let isPositive = true;

  if (yesterdayValue && todayValue) {
    const diff = BigInt(todayValue) - BigInt(yesterdayValue);
    dailyChange = diff.toString();
    isPositive = diff >= 0n;
    const percentChange = (Number(diff) / Number(yesterdayValue)) * 100;
    dailyChangePercent = Math.abs(percentChange).toFixed(2);
  }

  const lastUpdated = latestDate 
    ? new Date(latestDate).toLocaleDateString("ru-RU", { month: 'short', day: 'numeric' })
    : "—";

  return (
    <Card className="p-5 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Общий портфель</p>
      {isLoading ? (
        <Skeleton className="h-10 w-48 mb-2" />
      ) : (
        <p className="text-3xl font-bold tabular-nums mb-2" data-testid="text-portfolio-value">
          {formatMoney(totalPortfolio, "USDT")}
          <span className="text-base font-normal text-muted-foreground ml-1">USDT</span>
        </p>
      )}
      <div className="flex items-center gap-3">
        {isLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <span 
            className={`text-sm font-medium ${isPositive ? "text-positive" : "text-negative"}`}
            data-testid="text-daily-change"
          >
            {isPositive ? "+" : "-"}{formatMoney(dailyChange.replace("-", ""), "USDT")} ({dailyChangePercent}%)
          </span>
        )}
        <span className="text-xs text-muted-foreground">Обновлено {lastUpdated}</span>
      </div>
    </Card>
  );
}

type SheetType = "deposit" | "withdraw" | "transfer" | "invest" | null;

function QuickActions({ 
  onOpenSheet, 
}: { 
  onOpenSheet: (type: SheetType) => void;
}) {
  const actions: Array<{ icon: typeof ArrowDownLeft; label: string; sheet: SheetType; color: string }> = [
    { icon: ArrowDownLeft, label: "Пополнить", sheet: "deposit", color: "text-positive" },
    { icon: Send, label: "Перевод", sheet: "transfer", color: "text-primary" },
    { icon: ArrowUpRight, label: "Вывести", sheet: "withdraw", color: "text-warning" },
    { icon: TrendingUp, label: "Инвестировать", sheet: "invest", color: "text-accent-foreground" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.label}
            variant="outline"
            className="flex flex-col items-center justify-center w-full h-20 gap-1.5"
            onClick={() => onOpenSheet(action.sheet)}
            data-testid={`button-quick-${action.sheet}`}
          >
            <div className={`p-2 rounded-full bg-muted ${action.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">{action.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

function BalancesPreview({ bootstrap, isLoading }: { bootstrap?: BootstrapResponse; isLoading: boolean }) {
  const usdtBal = bootstrap?.balances?.USDT;
  const rubBal = bootstrap?.balances?.RUB;
  const hasBalances = bootstrap && (
    BigInt(usdtBal?.available || "0") > 0n ||
    BigInt(usdtBal?.locked || "0") > 0n ||
    BigInt(rubBal?.available || "0") > 0n ||
    BigInt(rubBal?.locked || "0") > 0n ||
    BigInt(bootstrap.invested?.current || "0") > 0n
  );

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    );
  }

  if (!hasBalances) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Балансы</span>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Нет средств</p>
          <Link href="/deposit/usdt">
            <Button size="sm" data-testid="button-first-deposit">
              <Plus className="w-4 h-4 mr-1" />
              Первый депозит
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Балансы</span>
        </div>
        <Link href="/wallet">
          <Button variant="ghost" size="sm" className="text-xs" data-testid="button-see-all-balances">
            Показать все <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-positive/10 flex items-center justify-center">
              <span className="text-xs font-bold text-positive">$</span>
            </div>
            <span className="text-sm font-medium">USDT</span>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-xs text-muted-foreground">Доступно</span>
              <span className="text-sm font-semibold tabular-nums" data-testid="text-balance-usdt">
                {formatMoney(usdtBal?.available || "0", "USDT")}
              </span>
            </div>
            <div className="flex items-baseline justify-end gap-2">
              <span className="text-xs text-muted-foreground">Инвестировано</span>
              <span className="text-xs font-medium tabular-nums" data-testid="text-balance-usdt-invested">
                {formatMoney(bootstrap?.invested?.current || "0", "USDT")}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">₽</span>
            </div>
            <span className="text-sm font-medium">RUB</span>
          </div>
          <span className="text-sm font-semibold tabular-nums" data-testid="text-balance-rub">
            {formatMoney(rubBal?.available || "0", "RUB")}
          </span>
        </div>
      </div>
    </Card>
  );
}

function VaultsPreview({ bootstrap, isLoading }: { bootstrap?: BootstrapResponse; isLoading: boolean }) {
  const principalVault = bootstrap?.vaults?.principal;
  const profitVault = bootstrap?.vaults?.profit;
  const hasVaults = bootstrap && (
    BigInt(principalVault?.balance || "0") > 0n || BigInt(profitVault?.balance || "0") > 0n
  );

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    );
  }

  if (!hasVaults) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Vault className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Сейфы</span>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Нет средств в сейфах</p>
          <Link href="/wallet/vaults">
            <Button size="sm" variant="outline" data-testid="button-manage-vaults">
              <PiggyBank className="w-4 h-4 mr-1" />
              Управление сейфами
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Vault className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Сейфы</span>
        </div>
        <Link href="/wallet/vaults">
          <Button variant="ghost" size="sm" className="text-xs" data-testid="button-see-all-vaults">
            Показать все <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <PiggyBank className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium">Основной</span>
          </div>
          <span className="text-sm font-semibold tabular-nums" data-testid="text-vault-principal">
            {formatMoney(principalVault?.balance || "0", "USDT")}
          </span>
        </div>
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-positive/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-positive" />
            </div>
            <span className="text-sm font-medium">Прибыль</span>
          </div>
          <span className="text-sm font-semibold tabular-nums" data-testid="text-vault-profit">
            {formatMoney(profitVault?.balance || "0", "USDT")}
          </span>
        </div>
      </div>
    </Card>
  );
}

function StrategiesPreview({ strategies, isLoading }: { strategies?: Strategy[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </Card>
    );
  }

  const topStrategies = strategies?.slice(0, 2) || [];

  if (topStrategies.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Стратегии</span>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Нет доступных стратегий</p>
        </div>
      </Card>
    );
  }

  const getRiskColor = (tier: string) => {
    const meta = TIER_META[tier as RiskTierKey];
    if (!meta) return "bg-muted text-muted-foreground";
    return `${meta.iconColor} bg-gradient-to-br ${meta.bgGradient}`;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Стратегии</span>
        </div>
        <Link href="/invest">
          <Button variant="ghost" size="sm" className="text-xs" data-testid="button-see-all-strategies">
            Показать все <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
      <div className="space-y-2">
        {topStrategies.map((strategy) => (
          <Link key={strategy.id} href={`/invest/${strategy.id}`}>
            <div 
              className="flex items-center justify-between py-2 px-2 rounded-lg hover-elevate cursor-pointer"
              data-testid={`strategy-preview-${strategy.id}`}
            >
              <div className="flex items-center gap-2">
                <div className={`px-2 py-0.5 rounded text-xs font-medium ${getRiskColor(strategy.riskTier)}`}>
                  {strategy.riskTier}
                </div>
                <span className="text-sm font-medium">{strategy.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {strategy.expectedMonthlyRangeBpsMin && strategy.expectedMonthlyRangeBpsMax 
                  ? `${(strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1)}-${(strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1)}%/мес`
                  : "—"
                }
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function InvestedPreview({ bootstrap, isLoading }: { bootstrap?: BootstrapResponse; isLoading: boolean }) {
  const hasInvested = bootstrap && BigInt(bootstrap.invested?.current || "0") > 0n;

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-10 w-32" />
      </Card>
    );
  }

  if (!hasInvested) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Инвестиционный капитал</span>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">Начните зарабатывать со стратегиями</p>
          <Link href="/invest">
            <Button size="sm" data-testid="button-start-investing">
              <TrendingUp className="w-4 h-4 mr-1" />
              Инвестировать
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const invested = bootstrap?.invested;
  const current = invested?.current || "0";
  const principal = invested?.principal || "0";
  
  const profitPercent = principal !== "0"
    ? ((Number(BigInt(current) - BigInt(principal)) / 
        Number(principal)) * 100).toFixed(2)
    : "0.00";
  const isProfit = BigInt(current) >= BigInt(principal);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Инвестировано</span>
        </div>
        <Link href="/wallet">
          <Button variant="ghost" size="sm" className="text-xs" data-testid="button-view-positions">
            Подробнее <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
      <p className="text-2xl font-bold tabular-nums" data-testid="text-invested-value">
        {formatMoney(current, "USDT")}
        <span className="text-sm font-normal text-muted-foreground ml-1">USDT</span>
      </p>
      <p className={`text-xs ${isProfit ? "text-positive" : "text-negative"}`}>
        {isProfit ? "+" : ""}{profitPercent}% от начального капитала
      </p>
    </Card>
  );
}

export default function Home() {
  useSetPageTitle("Главная");
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const { quotes, sparklines } = useMarketStream();

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: strategies, isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
      <HeroCard bootstrap={bootstrap} isLoading={bootstrapLoading} />
      
      <QuickActions onOpenSheet={setActiveSheet} />

      <LiveQuotesBar quotes={quotes} sparklines={sparklines} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalancesPreview bootstrap={bootstrap} isLoading={bootstrapLoading} />
        <VaultsPreview bootstrap={bootstrap} isLoading={bootstrapLoading} />
      </div>

      <InvestedPreview bootstrap={bootstrap} isLoading={bootstrapLoading} />

      <StrategiesPreview strategies={strategies} isLoading={strategiesLoading} />

      <DepositSheet
        open={activeSheet === "deposit"}
        onOpenChange={(open) => !open && setActiveSheet(null)}
        bootstrap={bootstrap}
      />
      <WithdrawSheet
        open={activeSheet === "withdraw"}
        onOpenChange={(open) => !open && setActiveSheet(null)}
        bootstrap={bootstrap}
      />
      <TransferSheet
        open={activeSheet === "transfer"}
        onOpenChange={(open) => !open && setActiveSheet(null)}
        bootstrap={bootstrap}
      />
      <InvestSheet
        open={activeSheet === "invest"}
        onOpenChange={(open) => !open && setActiveSheet(null)}
        bootstrap={bootstrap}
      />
    </div>
  );
}
