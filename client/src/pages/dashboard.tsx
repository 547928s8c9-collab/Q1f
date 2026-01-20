import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { LiveBadge } from "@/components/ui/live-badge";
import { formatMoney } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, Wallet, CheckCircle2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useEngineStream } from "@/hooks/use-engine-stream";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { RangeSelector, rangeToDays, type RangeOption } from "@/components/ui/range-selector";
import { ProofOfSafety } from "@/components/proof-of-safety";

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
    allocatedMinor: string;
    currentMinor: string;
    pnlMinor: string;
    roiPct: number;
    accruedProfitMinor: string;
    status: string;
  }>;
}

export default function Dashboard() {
  const [range, setRange] = useState<RangeOption>("30D");
  const days = rangeToDays(range);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", { days }],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/overview?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const { status: engineStatus, lastUpdated, isRunning } = useEngineStream();
  const { metrics: liveMetrics, getMetrics } = useLiveMetrics();

  const chartData = data?.equitySeries.map((d) => ({
    date: d.ts,
    value: parseFloat(d.equityMinor) / 1000000,
    displayValue: d.equityMinor,
  })) || [];

  const minValue = chartData.length > 0 ? Math.min(...chartData.map((d) => d.value)) : 0;
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 100;
  const padding = (maxValue - minValue) * 0.1 || 10;

  const pnl30d = data ? BigInt(data.metrics.pnl30dMinor) : BigInt(0);
  const pnlTrend = pnl30d >= 0n ? "positive" : "negative";

  if (isError) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader title="Dashboard" subtitle="Your investment overview" />
        <Card className="p-8 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Failed to load dashboard</h3>
          <p className="text-muted-foreground mb-4">There was an error loading your analytics data.</p>
          <Button onClick={() => refetch()} disabled={isFetching} data-testid="button-retry">
            <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader 
        title="Dashboard" 
        subtitle="Your investment overview"
        badge={
          <LiveBadge 
            status={isRunning ? "running" : engineStatus?.state === "idle" ? "idle" : "error"}
            lastUpdated={lastUpdated}
          />
        }
        action={
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => refetch()} 
            disabled={isFetching}
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
        }
      />

      {/* Total Equity Hero */}
      <Card className="p-6 mb-6" data-testid="card-total-equity">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground">Total Equity</p>
          {data && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(data.updatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums" data-testid="text-total-equity">
              {formatMoney(data?.totalEquityMinor || "0", "USDT")}
            </span>
            <span className="text-lg text-muted-foreground">USDT</span>
          </div>
        )}
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </>
        ) : (
          <>
            <MetricCard
              label="30d PnL"
              value={formatMoney(data?.metrics.pnl30dMinor || "0", "USDT")}
              suffix="USDT"
              trend={pnlTrend}
              change={`${pnl30d >= 0n ? "+" : ""}${(data?.metrics.roi30dPct || 0).toFixed(2)}%`}
            />
            <MetricCard
              label="30d ROI"
              value={`${(data?.metrics.roi30dPct || 0).toFixed(2)}%`}
              trend={data?.metrics.roi30dPct && data.metrics.roi30dPct >= 0 ? "positive" : "negative"}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${(data?.metrics.maxDrawdown30dPct || 0).toFixed(2)}%`}
              trend="neutral"
            />
            <MetricCard
              label="Active Positions"
              value={`${data?.metrics.activePositions || 0}`}
              suffix={`/ ${data?.metrics.positionsCount || 0}`}
            />
          </>
        )}
      </div>

      {/* Equity Chart */}
      <Card className="p-5 mb-6" data-testid="card-equity-chart">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Portfolio Growth</h2>
          <RangeSelector value={range} onChange={setRange} />
        </div>
        {isLoading ? (
          <div style={{ height: 280 }}>
            <ChartSkeleton height={280} />
          </div>
        ) : chartData.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No portfolio history"
            description="Start investing to see your equity growth over time."
          >
            <Link href="/invest">
              <Button data-testid="button-go-invest">Start Investing</Button>
            </Link>
          </EmptyState>
        ) : (
          <div className="w-full" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashboardGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(24, 85%, 48%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(24, 85%, 48%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }}
                  minTickGap={40}
                />
                <YAxis hide domain={[minValue - padding, maxValue + padding]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const point = payload[0].payload;
                      return (
                        <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">
                            {new Date(point.date).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-lg font-semibold tabular-nums">
                            {formatMoney(point.displayValue, "USDT")} <span className="text-sm text-muted-foreground">USDT</span>
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
                  stroke="hsl(24, 85%, 48%)"
                  strokeWidth={2}
                  fill="url(#dashboardGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Strategy Cards */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your Strategies</h2>
          {data && data.strategies.length > 0 && (
            <Link href="/invest">
              <Button variant="outline" size="sm" data-testid="button-view-all-strategies">
                View All
              </Button>
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : data?.strategies.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={Wallet}
              title="No active strategies"
              description="Explore our investment strategies and start growing your portfolio."
            >
              <Link href="/invest">
                <Button data-testid="button-explore-strategies">Explore Strategies</Button>
              </Link>
            </EmptyState>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.strategies.map((strategy) => {
              const liveMetric = getMetrics(strategy.strategyId);
              const pnl = liveMetric ? BigInt(liveMetric.pnlMinor) : BigInt(strategy.pnlMinor);
              const isProfitable = pnl >= 0n;
              const equity = liveMetric?.equityMinor || strategy.currentMinor;
              const pnlMinor = liveMetric?.pnlMinor || strategy.pnlMinor;
              const roiPct = liveMetric ? liveMetric.roi30dBps / 100 : strategy.roiPct;
              const trades24h = liveMetric?.trades24h;
              const state = liveMetric?.state || strategy.status;

              return (
                <Card key={strategy.strategyId} className="p-5" data-testid={`card-strategy-${strategy.strategyId}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{strategy.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge 
                          variant={strategy.riskTier === "LOW" ? "secondary" : strategy.riskTier === "HIGH" ? "destructive" : "default"}
                          className="text-xs"
                        >
                          {strategy.riskTier}
                        </Badge>
                        <Badge 
                          variant={state === "INVESTED_ACTIVE" || state === "active" ? "default" : state === "PAUSED" || state === "paused" ? "secondary" : "outline"}
                          className="text-xs"
                        >
                          {state === "INVESTED_ACTIVE" ? "ACTIVE" : state === "PAUSED" ? "PAUSED" : state === "active" ? "active" : state === "paused" ? "paused" : "NOT_INVESTED"}
                        </Badge>
                      </div>
                    </div>
                    {isProfitable ? (
                      <TrendingUp className="w-5 h-5 text-positive" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-negative" />
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equity</span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(equity, "USDT")} USDT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PnL</span>
                      <span className={cn("font-medium tabular-nums", isProfitable ? "text-positive" : "text-negative")}>
                        {isProfitable ? "+" : ""}{formatMoney(pnlMinor, "USDT")} USDT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">30d ROI</span>
                      <span className={cn("font-medium tabular-nums", roiPct >= 0 ? "text-positive" : "text-negative")}>
                        {roiPct >= 0 ? "+" : ""}{roiPct.toFixed(2)}%
                      </span>
                    </div>
                    {trades24h !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trades 24h</span>
                        <span className="font-medium tabular-nums">
                          {trades24h}
                        </span>
                      </div>
                    )}
                    {liveMetric?.maxDrawdown30dBps !== undefined && liveMetric.maxDrawdown30dBps > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Max DD 30d</span>
                        <span className="font-medium tabular-nums text-muted-foreground">
                          {(liveMetric.maxDrawdown30dBps / 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Proof of Safety & Latest Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ProofOfSafety />
        
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Latest Activity</h2>
            <Link href="/activity">
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </div>
          <LatestActivityWidget />
        </div>
      </div>
    </div>
  );
}

function LatestActivityWidget() {
  const { data, isLoading } = useQuery<{ events: Array<{ id: string; type: string; severity: string; message: string; strategyId: string | null; createdAt: string | null; payloadJson: unknown }> }>({
    queryKey: ["/api/activity", { limit: 5 }],
    queryFn: async () => {
      const res = await fetch("/api/activity?limit=5", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
  });

  const { data: strategies } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/strategies"],
    select: (data) => data?.map((s) => ({ id: s.id, name: s.name })) || [],
  });

  const getStrategyName = (strategyId: string | null) => {
    if (!strategyId) return undefined;
    return strategies?.find((s) => s.id === strategyId)?.name;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "TICK_OK":
        return CheckCircle2;
      case "TICK_FAIL":
        return AlertCircle;
      case "TRADE_OPEN":
        return TrendingUp;
      case "TRADE_CLOSE":
        return TrendingDown;
      case "DD_TRIGGER":
        return AlertCircle;
      default:
        return Activity;
    }
  };

  const getEventColor = (type: string, severity: string) => {
    if (severity === "error") return "text-red-500 bg-red-500/10";
    if (severity === "warn") return "text-yellow-500 bg-yellow-500/10";
    if (type === "TICK_OK") return "text-green-500 bg-green-500/10";
    if (type === "TRADE_OPEN") return "text-blue-500 bg-blue-500/10";
    if (type === "TRADE_CLOSE") return "text-purple-500 bg-purple-500/10";
    return "text-muted-foreground bg-muted";
  };

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const events = data?.events || [];

  if (events.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={Activity}
          title="No recent activity"
          description="Engine events will appear here when the trading engine is active"
          className="py-8"
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="space-y-3">
        {events.map((event) => {
          const Icon = getEventIcon(event.type);
          const colorClass = getEventColor(event.type, event.severity);
          const strategyName = getStrategyName(event.strategyId);

          return (
            <div key={event.id} className="flex items-start gap-3">
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0", colorClass)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant={event.severity === "error" ? "destructive" : event.severity === "warn" ? "secondary" : "default"} className="text-xs">
                    {event.type.replace(/_/g, " ")}
                  </Badge>
                  {strategyName && (
                    <span className="text-xs text-muted-foreground truncate">{strategyName}</span>
                  )}
                </div>
                <p className="text-sm font-medium truncate">{event.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {event.createdAt ? formatDistanceToNow(new Date(event.createdAt), { addSuffix: true }) : "Just now"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
