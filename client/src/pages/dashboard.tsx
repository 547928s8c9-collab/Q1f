import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@shared/schema";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

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
  const { data, isLoading, isError, refetch, isFetching } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview"],
    refetchOnWindowFocus: false,
  });

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
        <h2 className="text-lg font-semibold mb-4">Portfolio Growth (30 days)</h2>
        {isLoading ? (
          <ChartSkeleton height={280} />
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
              const pnl = BigInt(strategy.pnlMinor);
              const isProfitable = pnl >= 0n;

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
                          variant={strategy.status === "active" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {strategy.status}
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
                      <span className="text-muted-foreground">Allocated</span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(strategy.allocatedMinor, "USDT")} USDT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Value</span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(strategy.currentMinor, "USDT")} USDT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">PnL</span>
                      <span className={cn("font-medium tabular-nums", isProfitable ? "text-positive" : "text-negative")}>
                        {isProfitable ? "+" : ""}{formatMoney(strategy.pnlMinor, "USDT")} USDT
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ROI</span>
                      <span className={cn("font-medium tabular-nums", isProfitable ? "text-positive" : "text-negative")}>
                        {strategy.roiPct >= 0 ? "+" : ""}{strategy.roiPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
