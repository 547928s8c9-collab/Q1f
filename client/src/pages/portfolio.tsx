import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { ChartSkeleton } from "@/components/ui/loading-skeleton";
import { Sparkline } from "@/components/charts/sparkline";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { formatMoney, type BootstrapResponse, type Strategy } from "@shared/schema";
import { DepositSheet, WithdrawSheet } from "@/components/operations";
import { RangeSelector, rangeToDays, type RangeOption } from "@/components/ui/range-selector";
import {
  Plus,
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ActivityEvent {
  id: string;
  type: string;
  severity: string;
  message: string;
  strategyId: string | null;
  createdAt: string | null;
  payloadJson: unknown;
}

type SheetType = "deposit" | "withdraw" | null;

// ─── User-visible event types (filter out engine internals) ──────────────────

const USER_EVENT_TYPES = new Set([
  "DEPOSIT",
  "WITHDRAWAL",
  "INVEST_START",
  "INVEST_STOP",
  "TRANSFER",
  "PAYOUT",
  "FEE",
]);

function isUserEvent(event: ActivityEvent): boolean {
  return USER_EVENT_TYPES.has(event.type);
}

// ─── Section 1: Hero ─────────────────────────────────────────────────────────

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
    <section
      className="flex flex-col items-center justify-center text-center"
      style={{ minHeight: "calc(100dvh - 120px)", paddingBottom: 32 }}
    >
      {isLoading ? (
        <>
          <Skeleton className="h-14 w-56 mb-2" />
          <Skeleton className="h-5 w-36 mb-8" />
        </>
      ) : (
        <>
          <p
            className="tabular-nums"
            style={{
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
              fontSize: 48,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "hsl(var(--foreground))",
            }}
            data-testid="text-portfolio-balance"
          >
            {formatMoney(totalPortfolio, "USDT")}{" "}
            <span
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: "hsl(var(--muted-foreground))",
              }}
            >
              USDT
            </span>
          </p>

          <p
            className="tabular-nums mt-1"
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: isPositive
                ? "hsl(var(--success))"
                : "hsl(var(--danger))",
            }}
            data-testid="text-daily-change"
          >
            {isPositive ? "+" : "-"}
            {formatMoney(dailyChange.replace("-", ""), "USDT")} (
            {dailyChangePercent}%)
          </p>
        </>
      )}

      <div className="flex gap-3 w-full mt-8" style={{ maxWidth: 400 }}>
        <Button
          className="flex-1"
          style={{ borderRadius: 14, height: 52 }}
          onClick={() => onOpenSheet("deposit")}
          data-testid="button-deposit"
        >
          <Plus className="w-4 h-4 mr-2" />
          Пополнить
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          style={{ borderRadius: 14, height: 52 }}
          onClick={() => onOpenSheet("withdraw")}
          data-testid="button-withdraw"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Вывести
        </Button>
      </div>
    </section>
  );
}

// ─── Section 2: Investments ──────────────────────────────────────────────────

function InvestmentsSection({
  bootstrap,
  analytics,
  isLoading,
}: {
  bootstrap?: BootstrapResponse;
  analytics?: AnalyticsOverview;
  isLoading: boolean;
}) {
  const invested = bootstrap?.invested;
  const hasInvested = invested && BigInt(invested.current || "0") > 0n;
  const activeStrategies = analytics?.strategies || [];

  if (isLoading) {
    return (
      <section className="mb-8">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Инвестиции</h2>
        {hasInvested && (
          <span className="text-sm font-medium tabular-nums text-muted-foreground">
            {formatMoney(invested!.current, "USDT")} USDT
          </span>
        )}
      </div>

      {!hasInvested || activeStrategies.length === 0 ? (
        <Card
          className="p-6 text-center"
          style={{
            borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <p className="text-sm text-muted-foreground mb-4">
            Начните инвестировать
          </p>
          <Link href="/invest">
            <Button style={{ borderRadius: 14, height: 44 }} data-testid="button-choose-strategy">
              <TrendingUp className="w-4 h-4 mr-2" />
              Выбрать стратегию
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeStrategies.map((strategy) => {
            const pnl = BigInt(strategy.pnlMinor);
            const isProfitable = pnl >= 0n;

            // Generate simple sparkline data from current/allocated ratio
            const sparkData = Array.from({ length: 12 }, (_, i) => ({
              value:
                parseFloat(strategy.allocatedMinor) / 1e6 +
                (parseFloat(strategy.pnlMinor) / 1e6 / 12) * (i + 1) *
                  (0.8 + Math.random() * 0.4),
            }));

            return (
              <Link key={strategy.strategyId} href={`/invest/${strategy.strategyId}`}>
                <Card
                  className="p-4 cursor-pointer hover-elevate active-elevate"
                  style={{
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                  data-testid={`card-strategy-${strategy.strategyId}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold mb-1">
                        {strategy.name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Вложено: {formatMoney(strategy.allocatedMinor, "USDT")}{" "}
                        USDT
                      </p>
                      <p
                        className="text-xs font-medium tabular-nums mt-0.5"
                        style={{
                          color: isProfitable
                            ? "hsl(var(--success))"
                            : "hsl(var(--danger))",
                        }}
                      >
                        {isProfitable ? "+" : ""}
                        {strategy.roiPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="w-16 flex-shrink-0">
                      <Sparkline
                        data={sparkData}
                        positive={isProfitable}
                        height={32}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Section 3: Chart ────────────────────────────────────────────────────────

function ChartSection({
  analytics,
  isLoading,
  range,
  onRangeChange,
}: {
  analytics?: AnalyticsOverview;
  isLoading: boolean;
  range: RangeOption;
  onRangeChange: (r: RangeOption) => void;
}) {
  const chartData = useMemo(
    () =>
      (analytics?.equitySeries || []).map((d) => ({
        date: d.ts,
        value: parseFloat(d.equityMinor) / 1e6,
        displayValue: d.equityMinor,
      })),
    [analytics?.equitySeries],
  );

  const { minValue, maxValue, padding } = useMemo(() => {
    if (chartData.length === 0)
      return { minValue: 0, maxValue: 100, padding: 10 };
    const min = Math.min(...chartData.map((d) => d.value));
    const max = Math.max(...chartData.map((d) => d.value));
    const p = (max - min) * 0.1 || 10;
    return { minValue: min, maxValue: max, padding: p };
  }, [chartData]);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Рост портфеля</h2>
        <RangeSelector value={range} onChange={onRangeChange} />
      </div>

      <Card
        className="p-4"
        style={{ borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)" }}
      >
        {isLoading ? (
          <ChartSkeleton height={240} />
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 240 }}>
            <p className="text-sm text-muted-foreground">
              Начните инвестировать, чтобы увидеть график
            </p>
          </div>
        ) : (
          <div className="w-full" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="portfolioGrowthGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.15}
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
                <YAxis
                  hide
                  domain={[minValue - padding, maxValue + padding]}
                />
                <Tooltip
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
                  fill="url(#portfolioGrowthGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  );
}

// ─── Section 4: Operations ───────────────────────────────────────────────────

function OperationsSection({ isLoading }: { isLoading: boolean }) {
  const { data } = useQuery<{
    events: ActivityEvent[];
    nextCursor?: string;
  }>({
    queryKey: ["/api/activity", { limit: 20 }],
    queryFn: async () => {
      const res = await fetch("/api/activity?limit=20", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
  });

  const userEvents = useMemo(
    () => (data?.events || []).filter(isUserEvent).slice(0, 5),
    [data?.events],
  );

  if (isLoading) {
    return (
      <section className="mb-8">
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-16 w-full rounded-2xl mb-2" />
        <Skeleton className="h-16 w-full rounded-2xl mb-2" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </section>
    );
  }

  if (userEvents.length === 0) return null;

  const getEventLabel = (event: ActivityEvent) => {
    switch (event.type) {
      case "DEPOSIT":
        return "Пополнение";
      case "WITHDRAWAL":
        return "Вывод";
      case "INVEST_START":
        return "Подключена стратегия";
      case "INVEST_STOP":
        return "Отключена стратегия";
      case "TRANSFER":
        return "Перевод";
      case "PAYOUT":
        return "Выплата";
      case "FEE":
        return "Комиссия";
      default:
        return event.type;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "DEPOSIT":
      case "PAYOUT":
        return "hsl(var(--success))";
      case "WITHDRAWAL":
      case "FEE":
        return "hsl(var(--danger))";
      default:
        return "hsl(var(--primary))";
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Операции</h2>
        <Link href="/activity">
          <Button
            variant="ghost"
            size="sm"
            className="text-sm text-muted-foreground"
            data-testid="button-all-operations"
          >
            Все
            <ChevronRight className="w-4 h-4 ml-0.5" />
          </Button>
        </Link>
      </div>

      <Card
        className="divide-y divide-border"
        style={{ borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)" }}
      >
        {userEvents.map((event) => (
          <div
            key={event.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${getEventColor(event.type)} 12%, transparent)`,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getEventColor(event.type) }}
                />
              </div>
              <div>
                <p className="text-sm font-medium">{getEventLabel(event)}</p>
                {event.createdAt && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm font-medium tabular-nums">{event.message}</p>
          </div>
        ))}
      </Card>
    </section>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Portfolio() {
  useSetPageTitle("Портфель");
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [range, setRange] = useState<RangeOption>("30D");
  const days = rangeToDays(range);

  const { data: bootstrap, isLoading: bootstrapLoading } =
    useQuery<BootstrapResponse>({
      queryKey: ["/api/bootstrap"],
    });

  const { data: analytics, isLoading: analyticsLoading } =
    useQuery<AnalyticsOverview>({
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

  return (
    <div
      className="max-w-lg mx-auto px-5"
      style={{ backgroundColor: "#FFFFFF", minHeight: "100dvh" }}
    >
      <HeroSection
        bootstrap={bootstrap}
        isLoading={bootstrapLoading}
        onOpenSheet={setActiveSheet}
      />

      <InvestmentsSection
        bootstrap={bootstrap}
        analytics={analytics}
        isLoading={bootstrapLoading || analyticsLoading}
      />

      <ChartSection
        analytics={analytics}
        isLoading={analyticsLoading}
        range={range}
        onRangeChange={setRange}
      />

      <OperationsSection isLoading={bootstrapLoading} />

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
