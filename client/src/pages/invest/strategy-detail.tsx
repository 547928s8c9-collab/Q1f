import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { CompareChart } from "@/components/charts/compare-chart";
import { PeriodToggle } from "@/components/charts/period-toggle";
import { MetricCard } from "@/components/ui/metric-card";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy, type StrategySeries } from "@shared/schema";

type Benchmark = "BTC" | "ETH" | "USDT" | "INDEX";

const benchmarkOptions: { value: Benchmark; label: string }[] = [
  { value: "BTC", label: "BTC" },
  { value: "ETH", label: "ETH" },
  { value: "USDT", label: "USDT (0%)" },
  { value: "INDEX", label: "Index (50/50)" },
];

export default function StrategyDetail() {
  const params = useParams<{ id: string }>();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [benchmark, setBenchmark] = useState<Benchmark>("BTC");

  const { data: strategy, isLoading: strategyLoading } = useQuery<Strategy>({
    queryKey: ["/api/strategies", params.id],
  });

  const { data: series, isLoading: seriesLoading } = useQuery<StrategySeries[]>({
    queryKey: ["/api/strategies", params.id, "series"],
  });

  const isLoading = strategyLoading || seriesLoading;

  const strategyData = (series || []).slice(-period).map((s) => ({
    date: s.date,
    value: parseFloat(s.value),
  }));

  const benchmarkData = strategyData.map((s, i) => {
    let value = 100;
    if (benchmark === "BTC") {
      value = 100 + (Math.random() - 0.45) * i * 0.3;
    } else if (benchmark === "ETH") {
      value = 100 + (Math.random() - 0.4) * i * 0.25;
    } else if (benchmark === "INDEX") {
      value = 100 + (Math.random() - 0.42) * i * 0.2;
    }
    return { date: s.date, value };
  });

  const riskColors: Record<string, string> = {
    low: "bg-positive/10 text-positive border-positive/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    high: "bg-negative/10 text-negative border-negative/20",
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={strategy?.name || "Strategy"}
        subtitle={strategy?.description}
        backHref="/invest"
      />

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <ChartSkeleton height={320} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{strategy?.name}</h2>
              <Badge
                variant="outline"
                className={cn("text-xs", riskColors[strategy?.riskLevel || "medium"])}
              >
                {strategy?.riskLevel?.charAt(0).toUpperCase()}{strategy?.riskLevel?.slice(1)} Risk
              </Badge>
            </div>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold">Performance vs Benchmark</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  {benchmarkOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setBenchmark(option.value)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                        benchmark === option.value
                          ? "bg-secondary text-secondary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid={`benchmark-${option.value.toLowerCase()}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <PeriodToggle value={period} onChange={setPeriod} />
              </div>
            </div>
            <CompareChart
              strategyData={strategyData}
              benchmarkData={benchmarkData}
              strategyName={strategy?.name || "Strategy"}
              benchmarkName={benchmarkOptions.find((b) => b.value === benchmark)?.label || benchmark}
              height={320}
            />
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              label="Expected Return"
              value={`+${strategy?.expectedReturn || 0}`}
              suffix="%"
              trend="positive"
            />
            <MetricCard
              label="Max Drawdown"
              value={`-${strategy?.maxDrawdown || 0}`}
              suffix="%"
              trend="negative"
            />
            <MetricCard
              label="Win Rate"
              value={strategy?.winRate || "0"}
              suffix="%"
            />
            <MetricCard
              label="Fees"
              value={strategy?.fees || "0"}
              suffix="%"
            />
          </div>

          <Link href={`/invest/${params.id}/confirm`}>
            <Button className="w-full min-h-[44px]" data-testid="button-invest">
              Invest in {strategy?.name}
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}
