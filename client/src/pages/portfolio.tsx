import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton, ChartSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { formatMoney, type BootstrapResponse, type Strategy } from "@shared/schema";
import { RangeSelector, rangeToDays, type RangeOption } from "@/components/ui/range-selector";
import { DepositSheet, WithdrawSheet } from "@/components/operations";
import { TIER_META, type RiskTierKey } from "@/components/strategy/tier-card";
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

type SheetType = "deposit" | "withdraw" | null;

interface AnalyticsOverview {
  updatedAt: string;
  totalEquityMinor: string;
  metrics: {
    pnl30dMinor: string;
    roi30dPct: number;
    maxDrawdown30dPct: number;
    positionsCount: number;
    activePositions: number;
  };
  equitySeries: Array<{ ts: string; equityMinor: string }>;
  strategies: Array<{
    strategyId: string;
    name: string;
    riskTier: string;
    symbol: string | null;
    allocatedMinor: string;
    currentMinor: string;
    pnlMinor: string;
    roiPct: number;
    accruedProfitMinor: string;
    status: string;
  }>;
}

/* ─── СЕКЦИЯ 1: Hero ─── */
function HeroSection({
  bootstrap,
  isLoading,
  onOpenSheet,
}: {
  bootstrap?: BootstrapResponse;
  isLoading: boolean;
  onOpenSheet: (type: SheetType) => void;
}) {
  const usdtBalance = bootstrap?.balances?.USDT;
  const totalPortfolio =
    bootstrap && usdtBalance
      ? (
          BigInt(usdtBalance.available || "0") +
          BigInt(usdtBalance.locked || "0") +
          BigInt(bootstrap.invested?.current || "0")
        ).toString()
      : "0";

  const todaySeries = bootstrap?.portfolioSeries || [];
  const yesterdayValue =
    todaySeries.length >= 2 ? todaySeries[todaySeries.length - 2]?.value : null;
  const todayValue =
    todaySeries.length >= 1 ? todaySeries[todaySeries.length - 1]?.value : null;

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

  return (
    <div className="text-center py-2">
      {isLoading ? (
        <Skeleton className="h-14 w-56 mx-auto mb-2" />
      ) : (
        <p
          className="tabular-nums mb-1"
          style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.1 }}
          data-testid="text-portfolio-value"
        >
          {formatMoney(totalPortfolio, "USDT")}
          <span className="text-lg font-normal text-muted-foreground ml-1">
            USDT
          </span>
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-5 w-32 mx-auto mb-4" />
      ) : (
        <p
          className="text-sm font-medium mb-5"
          style={{
            color: isPositive
              ? "hsl(var(--success))"
              : "hsl(var(--danger))",
          }}
          data-testid="text-daily-change"
        >
          {isPositive ? "+" : "-"}
          {formatMoney(dailyChange.replace("-", ""), "USDT")} (
          {dailyChangePercent}%) за день
        </p>
      )}

      <div className="flex gap-3 justify-center">
        <Button
          size="lg"
          className="flex-1 max-w-[180px] gap-2"
          onClick={() => onOpenSheet("deposit")}
          data-testid="button-deposit"
        >
          <ArrowDownLeft className="w-4 h-4" />
          Пополнить
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1 max-w-[180px] gap-2"
          onClick={() => onOpenSheet("withdraw")}
          data-testid="button-withdraw"
        >
          <ArrowUpRight className="w-4 h-4" />
          Вывести
        </Button>
      </div>
    </div>
  );
}

/* ─── СЕКЦИЯ 2: Мои инвестиции ─── */
function InvestmentsSection({
  bootstrap,
  strategies,
  isLoading,
}: {
  bootstrap?: BootstrapResponse;
  strategies?: Strategy[];
  isLoading: boolean;
}) {
  const invested = bootstrap?.invested;
  const current = invested?.current || "0";
  const principal = invested?.principal || "0";
  const hasInvested = BigInt(current) > 0n;

  const profitPercent =
    principal !== "0"
      ? ((Number(BigInt(current) - BigInt(principal)) / Number(principal)) * 100).toFixed(2)
      : "0.00";
  const isProfit = BigInt(current) >= BigInt(principal);

  // Find the first active strategy with allocation
  const activeStrategy = strategies?.find(
    (s) => BigInt(bootstrap?.invested?.current || "0") > 0n
  );

  const getRiskColor = (tier: string) => {
    const meta = TIER_META[tier as RiskTierKey];
    if (!meta) return "bg-muted text-muted-foreground";
    return `${meta.iconColor} bg-gradient-to-br ${meta.bgGradient}`;
  };

  if (isLoading) {
    return (
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <Skeleton className="h-5 w-32 mb-4" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!hasInvested) {
    return (
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold">Инвестиции</span>
          <span className="text-sm text-muted-foreground tabular-nums">0.00 USDT</span>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-3">
            Начните зарабатывать со стратегиями
          </p>
          <Link href="/strategies">
            <Button size="sm" data-testid="button-start-investing">
              <TrendingUp className="w-4 h-4 mr-1" />
              Инвестировать
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold">Инвестиции</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatMoney(current, "USDT")} USDT
        </span>
      </div>

      {activeStrategy ? (
        <Link href={`/invest/${activeStrategy.id}`}>
          <div
            className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
            data-testid="card-active-strategy"
          >
            <div className="flex items-center gap-3">
              <div
                className={`px-2 py-0.5 rounded text-xs font-medium ${getRiskColor(activeStrategy.riskTier)}`}
              >
                {activeStrategy.riskTier}
              </div>
              <div>
                <p className="text-sm font-medium">{activeStrategy.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(current, "USDT")} USDT
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-medium tabular-nums"
                style={{
                  color: isProfit
                    ? "hsl(var(--success))"
                    : "hsl(var(--danger))",
                }}
              >
                {isProfit ? "+" : ""}
                {profitPercent}%
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>
        </Link>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold tabular-nums" data-testid="text-invested-value">
            {formatMoney(current, "USDT")} USDT
          </p>
          <span
            className="text-sm font-medium tabular-nums"
            style={{
              color: isProfit
                ? "hsl(var(--success))"
                : "hsl(var(--danger))",
            }}
          >
            {isProfit ? "+" : ""}
            {profitPercent}%
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── СЕКЦИЯ 3: График ─── */
function ChartSection() {
  const [range, setRange] = useState<RangeOption>("30D");
  const days = rangeToDays(range);

  const { data, isLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", { days }],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/overview?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchOnWindowFocus: false,
    refetchInterval: 15_000,
  });

  const chartData = useMemo(
    () =>
      (data?.equitySeries || []).map((d) => ({
        date: d.ts,
        value: parseFloat(d.equityMinor) / 1000000,
        displayValue: d.equityMinor,
      })),
    [data?.equitySeries],
  );

  const minValue =
    chartData.length > 0 ? Math.min(...chartData.map((d) => d.value)) : 0;
  const maxValue =
    chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 100;
  const padding = (maxValue - minValue) * 0.1 || 10;

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Рост портфеля</h2>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <div style={{ height: 240 }}>
          <ChartSkeleton height={240} />
        </div>
      ) : chartData.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Нет истории портфеля"
          description="Начните инвестировать, чтобы увидеть рост вашего капитала."
        >
          <Link href="/strategies">
            <Button data-testid="button-go-invest">Начать инвестировать</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="w-full" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="portfolioGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--primary))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: "hsl(var(--muted-foreground))",
                }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString("ru-RU", {
                    month: "short",
                    day: "numeric",
                  });
                }}
                minTickGap={40}
              />
              <YAxis hide domain={[minValue - padding, maxValue + padding]} />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload;
                    return (
                      <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                        <p className="text-xs text-muted-foreground mb-1">
                          {new Date(point.date).toLocaleDateString("ru-RU", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-lg font-semibold tabular-nums">
                          {formatMoney(point.displayValue, "USDT")}{" "}
                          <span className="text-sm text-muted-foreground">
                            USDT
                          </span>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ─── СЕКЦИЯ 4: Балансы (компактно) ─── */
function BalancesSection({
  bootstrap,
  isLoading,
}: {
  bootstrap?: BootstrapResponse;
  isLoading: boolean;
}) {
  const usdtBal = bootstrap?.balances?.USDT;
  const rubBal = bootstrap?.balances?.RUB;
  const investedCurrent = bootstrap?.invested?.current || "0";

  const usdtAvailable = BigInt(usdtBal?.available || "0");
  const usdtInvested = BigInt(investedCurrent);
  const rubAvailable = BigInt(rubBal?.available || "0");

  const hasUsdt = usdtAvailable > 0n || usdtInvested > 0n;
  const hasRub = rubAvailable > 0n;

  if (isLoading) {
    return (
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <Skeleton className="h-5 w-24 mb-4" />
        <Skeleton className="h-12 w-full mb-2" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!hasUsdt && !hasRub) return null;

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <span className="text-sm font-semibold mb-3 block">Балансы</span>

      <div className="space-y-3">
        {hasUsdt && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "hsla(var(--success), 0.1)" }}
              >
                <span
                  className="text-xs font-bold"
                  style={{ color: "hsl(var(--success))" }}
                >
                  $
                </span>
              </div>
              <span className="text-sm font-medium">USDT</span>
            </div>
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-2">
                <span className="text-xs text-muted-foreground">Доступно</span>
                <span
                  className="text-sm font-semibold tabular-nums"
                  data-testid="text-balance-usdt"
                >
                  {formatMoney(usdtBal?.available || "0", "USDT")}
                </span>
              </div>
              {usdtInvested > 0n && (
                <div className="flex items-baseline justify-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    Инвестировано
                  </span>
                  <span
                    className="text-xs font-medium tabular-nums"
                    data-testid="text-balance-usdt-invested"
                  >
                    {formatMoney(investedCurrent, "USDT")}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {hasRub && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "hsla(var(--primary), 0.1)" }}
              >
                <span
                  className="text-xs font-bold"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  ₽
                </span>
              </div>
              <span className="text-sm font-medium">RUB</span>
            </div>
            <span
              className="text-sm font-semibold tabular-nums"
              data-testid="text-balance-rub"
            >
              {formatMoney(rubBal?.available || "0", "RUB")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Главный компонент ─── */
export default function PortfolioPage() {
  useSetPageTitle("Портфель");
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);

  const { data: bootstrap, isLoading: bootstrapLoading } =
    useQuery<BootstrapResponse>({
      queryKey: ["/api/bootstrap"],
    });

  const { data: strategies, isLoading: strategiesLoading } = useQuery<
    Strategy[]
  >({
    queryKey: ["/api/strategies"],
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-5 pb-24">
      {/* СЕКЦИЯ 1 — Hero: баланс + кнопки */}
      <HeroSection
        bootstrap={bootstrap}
        isLoading={bootstrapLoading}
        onOpenSheet={setActiveSheet}
      />

      {/* СЕКЦИЯ 2 — Мои инвестиции */}
      <InvestmentsSection
        bootstrap={bootstrap}
        strategies={strategies}
        isLoading={bootstrapLoading || strategiesLoading}
      />

      {/* СЕКЦИЯ 3 — График роста портфеля */}
      <ChartSection />

      {/* СЕКЦИЯ 4 — Балансы (компактно, только ненулевые) */}
      <BalancesSection bootstrap={bootstrap} isLoading={bootstrapLoading} />

      {/* Sheets */}
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
    </div>
  );
}
