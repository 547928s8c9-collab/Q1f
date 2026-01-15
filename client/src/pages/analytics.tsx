import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { PortfolioChart } from "@/components/charts/portfolio-chart";
import { PeriodToggle } from "@/components/charts/period-toggle";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { formatMoney, type BootstrapResponse } from "@shared/schema";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts";

export default function Analytics() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);

  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const filteredSeries = bootstrap?.portfolioSeries.slice(-period) || [];

  const calculateCashflow = () => {
    if (!bootstrap) return { netDeposits: "0", invested: "0", realizedPnl: "0", unrealizedPnl: "0" };

    const invested = bootstrap.invested.current;
    const principal = bootstrap.invested.principal;
    const unrealizedPnl = (BigInt(invested) - BigInt(principal)).toString();

    return {
      netDeposits: bootstrap.balances.USDT.available,
      invested: invested,
      realizedPnl: "0",
      unrealizedPnl,
    };
  };

  const cashflow = calculateCashflow();

  const monthlyData = bootstrap?.portfolioSeries
    .filter((_, i, arr) => i % 7 === 0 || i === arr.length - 1)
    .map((d, i, arr) => {
      const prevValue = i > 0 ? parseFloat(arr[i - 1].value) : parseFloat(d.value);
      const currentValue = parseFloat(d.value);
      const change = ((currentValue - prevValue) / prevValue) * 100;
      return {
        date: d.date,
        change: parseFloat(change.toFixed(2)),
        value: currentValue,
      };
    })
    .slice(-12) || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Analytics" subtitle="Track your portfolio performance and cashflow" />

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Portfolio Value</h2>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        {isLoading ? (
          <ChartSkeleton height={280} />
        ) : (
          <PortfolioChart data={filteredSeries} height={280} />
        )}
      </Card>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Cashflow Summary</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                label="Net Deposits"
                value={formatMoney(cashflow.netDeposits, "USDT")}
                suffix="USDT"
              />
              <MetricCard
                label="Invested"
                value={formatMoney(cashflow.invested, "USDT")}
                suffix="USDT"
              />
              <MetricCard
                label="Realized P&L"
                value={formatMoney(cashflow.realizedPnl, "USDT")}
                suffix="USDT"
                trend={BigInt(cashflow.realizedPnl) >= 0n ? "positive" : "negative"}
              />
              <MetricCard
                label="Unrealized P&L"
                value={formatMoney(cashflow.unrealizedPnl, "USDT")}
                suffix="USDT"
                trend={BigInt(cashflow.unrealizedPnl) >= 0n ? "positive" : "negative"}
                change={BigInt(cashflow.unrealizedPnl) >= 0n ? `+${formatMoney(cashflow.unrealizedPnl, "USDT")}` : formatMoney(cashflow.unrealizedPnl, "USDT")}
              />
            </>
          )}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold mb-4">Weekly Performance</h2>
        {isLoading ? (
          <ChartSkeleton height={200} />
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis
                  hide
                  domain={["dataMin - 1", "dataMax + 1"]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                          <p className="text-xs text-muted-foreground mb-1">
                            {new Date(data.date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                          </p>
                          <p className={`text-sm font-semibold tabular-nums ${data.change >= 0 ? "text-positive" : "text-negative"}`}>
                            {data.change >= 0 ? "+" : ""}{data.change}%
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.change >= 0 ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}
