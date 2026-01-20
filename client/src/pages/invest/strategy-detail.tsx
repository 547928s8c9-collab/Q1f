import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/ui/page-header";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CandlestickChart, type CandlestickMarker } from "@/components/charts/candlestick-chart";
import { CompareChart } from "@/components/charts/compare-chart";
import {
  TrendingUp,
  AlertTriangle,
  Shield,
  Zap,
  Calculator,
  Wallet,
  Info,
  ExternalLink,
  ShieldAlert,
  Pause,
  Play,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Strategy,
  type StrategyPerformance,
  type PayoutInstruction,
  type WhitelistAddress,
  type Timeframe,
  formatMoney,
} from "@shared/schema";
import type { InvestCandlesResponse, InvestInsightsResponse } from "@shared/contracts/invest";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { buildBenchmarkSeries, buildStrategySeries } from "@/lib/performance";
import { RangeSelector, rangeToDays, type RangeOption } from "@/components/ui/range-selector";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const riskConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  LOW: { color: "bg-positive/10 text-positive border-positive/20", icon: Shield, label: "Low Risk" },
  CORE: { color: "bg-warning/10 text-warning border-warning/20", icon: TrendingUp, label: "Core Risk" },
  HIGH: { color: "bg-negative/10 text-negative border-negative/20", icon: Zap, label: "High Risk" },
};

const timeframeOptions: { value: Timeframe; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
];

const timeframeStepMs: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}


export default function StrategyDetail() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [range, setRange] = useState<RangeOption>("30D");
  const periodDays = rangeToDays(range);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>("15m");
  const [amount, setAmount] = useState("1000");
  const [performanceView, setPerformanceView] = useState<"strategy" | "benchmark" | "both">("both");
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [tradeDetailsOpen, setTradeDetailsOpen] = useState(false);
  const [tradesCursor, setTradesCursor] = useState<string | undefined>(undefined);

  const candleLimit = useMemo(() => {
    const stepMs = timeframeStepMs[chartTimeframe];
    const targetBars = Math.ceil((periodDays * 24 * 60 * 60 * 1000) / stepMs);
    return Math.min(Math.max(targetBars, 50), 1500);
  }, [chartTimeframe, periodDays]);

  // Memoize marker click handler to prevent chart recreation on every render
  const handleMarkerClick = useCallback((marker: CandlestickMarker) => {
    if (marker.tradeId) {
      setSelectedTradeId(marker.tradeId);
      setTradeDetailsOpen(true);
    }
  }, []); // State setters are stable, so empty deps array is safe

  // Payout settings state
  const [payoutFrequency, setPayoutFrequency] = useState<"DAILY" | "MONTHLY">("MONTHLY");
  const [payoutAddressId, setPayoutAddressId] = useState<string>("");
  const [payoutMinAmount, setPayoutMinAmount] = useState("10");
  const [payoutActive, setPayoutActive] = useState(false);

  // Risk controls state
  const [ddLimitPct, setDdLimitPct] = useState(0);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(false);

  interface RiskControlsResponse {
    paused: boolean;
    ddLimitPct: number;
    autoPauseEnabled: boolean;
    pausedAt: string | null;
    pausedReason: string | null;
    hasPosition: boolean;
    currentDrawdownPct: number;
  }

  const { data: strategy, isLoading: strategyLoading } = useQuery<Strategy>({
    queryKey: ["/api/strategies", params.id],
  });

  const { data: performance, isLoading: perfLoading, error: perfError } = useQuery<StrategyPerformance[]>({
    queryKey: ["/api/strategies", params.id, "performance", { days: periodDays.toString() }],
  });

  const { data: payoutInstruction } = useQuery<PayoutInstruction | null>({
    queryKey: ["/api/payout-instructions", params.id],
    enabled: !!params.id,
  });

  const { data: whitelistAddresses } = useQuery<WhitelistAddress[]>({
    queryKey: ["/api/security/whitelist"],
  });

  const { data: riskControls } = useQuery<RiskControlsResponse>({
    queryKey: ["/api/positions", params.id, "risk-controls"],
    enabled: !!params.id,
  });

  const {
    data: candleResponse,
    isLoading: candlesLoading,
    error: candlesError,
  } = useQuery<InvestCandlesResponse>({
    queryKey: [
      "/api/invest/strategies",
      params.id,
      "candles",
      { timeframe: chartTimeframe, periodDays: periodDays.toString(), limit: candleLimit.toString() },
    ],
    enabled: !!params.id,
  });

  const {
    data: insightsResponse,
    isLoading: insightsLoading,
    error: insightsError,
  } = useQuery<InvestInsightsResponse>({
    queryKey: [
      "/api/invest/strategies",
      params.id,
      "insights",
      { timeframe: chartTimeframe, periodDays: periodDays.toString() },
    ],
    enabled: !!params.id,
  });

  // Fetch trades with pagination
  const {
    data: tradesResponse,
    isLoading: tradesLoading,
  } = useQuery({
    queryKey: [
      "/api/invest/strategies",
      params.id,
      "trades",
      { periodDays: periodDays.toString(), cursor: tradesCursor },
    ],
    queryFn: async () => {
      const url = `/api/invest/strategies/${params.id}/trades?limit=100${tradesCursor ? `&cursor=${tradesCursor}` : ""}`;
      const response = await apiRequest<{ ok: true; data: { trades: any[]; nextCursor?: string } }>("GET", url);
      return response;
    },
    enabled: !!params.id,
  });

  // Fetch trade events for selected trade
  const {
    data: tradeEventsResponse,
    isLoading: tradeEventsLoading,
  } = useQuery({
    queryKey: ["/api/invest/strategies", params.id, "trade-events", selectedTradeId],
    queryFn: async () => {
      if (!selectedTradeId) return null;
      const url = `/api/invest/strategies/${params.id}/trade-events?tradeId=${selectedTradeId}`;
      const response = await apiRequest<{ ok: true; data: { events: any[] } }>("GET", url);
      return response;
    },
    enabled: !!selectedTradeId && tradeDetailsOpen,
  });

  const minInvestmentMajor = useMemo(() => {
    return toMajorUnits(strategy?.minInvestment ?? "0", 6);
  }, [strategy?.minInvestment]);

  // Initialize payout settings from fetched instruction
  useEffect(() => {
    if (payoutInstruction) {
      setPayoutFrequency(payoutInstruction.frequency as "DAILY" | "MONTHLY");
      setPayoutAddressId(payoutInstruction.addressId || "");
      setPayoutMinAmount(formatMoney(payoutInstruction.minPayoutMinor, "USDT"));
      setPayoutActive(payoutInstruction.active || false);
    }
  }, [payoutInstruction]);

  // Initialize risk controls from fetched data
  useEffect(() => {
    if (riskControls) {
      setDdLimitPct(riskControls.ddLimitPct);
      setAutoPauseEnabled(riskControls.autoPauseEnabled);
    }
  }, [riskControls]);

  const savePayoutMutation = useMutation({
    mutationFn: async (data: {
      strategyId: string;
      frequency: string;
      addressId?: string;
      minPayoutMinor: string;
      active: boolean;
    }) => {
      return apiRequest("POST", "/api/payout-instructions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payout-instructions", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Payout settings saved" });
    },
    onError: (error: Error & { code?: string }) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSavePayout = () => {
    const minPayoutMinor = (parseFloat(payoutMinAmount) * 1000000).toString();
    savePayoutMutation.mutate({
      strategyId: params.id!,
      frequency: payoutFrequency,
      addressId: payoutAddressId || undefined,
      minPayoutMinor,
      active: payoutActive,
    });
  };

  const pauseMutation = useMutation({
    mutationFn: async (paused: boolean) => {
      const res = await apiRequest("POST", `/api/positions/${params.id}/pause`, { paused });
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions", params.id, "risk-controls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: data.message || "Strategy pause status updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const riskControlsMutation = useMutation({
    mutationFn: async (data: { ddLimitPct: number; autoPauseEnabled: boolean }) => {
      return apiRequest("POST", `/api/positions/${params.id}/risk-controls`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/positions", params.id, "risk-controls"] });
      toast({ title: "Risk controls updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveRiskControls = () => {
    riskControlsMutation.mutate({ ddLimitPct, autoPauseEnabled });
  };

  const activeAddresses = whitelistAddresses?.filter((a) => a.status === "ACTIVE") || [];
  const pendingAddresses = whitelistAddresses?.filter((a) => a.status === "PENDING_ACTIVATION") || [];
  const hasActiveAddress = activeAddresses.length > 0;

  const isLoading = strategyLoading || perfLoading;

  const tier = strategy?.riskTier || "CORE";
  const config = riskConfig[tier] || riskConfig.CORE;
  const Icon = config.icon;

  const filteredPerf = performance || [];

  const strategyData = useMemo(() => buildStrategySeries(filteredPerf), [filteredPerf]);

  const lastStrategyValue = strategyData[strategyData.length - 1]?.value || 100;
  const strategyReturn = ((lastStrategyValue - 100) / 100) * 100;

  const amountNum = parseFloat(amount) || 1000;
  const result = amountNum * (1 + strategyReturn / 100);
  const pnl = result - amountNum;

  const minReturn = strategy?.expectedMonthlyRangeBpsMin
    ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1)
    : "0";
  const maxReturn = strategy?.expectedMonthlyRangeBpsMax
    ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1)
    : "0";

  const pairs = Array.isArray(strategy?.pairsJson) ? strategy.pairsJson : [];
  const fees = strategy?.feesJson as { management?: string; performance?: string } | null;
  const terms = strategy?.termsJson as { profitPayout?: string; principalRedemption?: string } | null;

  const candlePayload = candleResponse?.ok ? candleResponse.data : null;
  const insightsPayload = insightsResponse?.ok ? insightsResponse.data : null;
  // Filter out invalid candles to prevent chart crashes
  const candleData = (candlePayload?.candles ?? []).filter(
    (c) =>
      c &&
      Number.isFinite(c.ts) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.high >= c.low
  );
  const benchmarkData = useMemo(() => buildBenchmarkSeries(filteredPerf, candleData), [filteredPerf, candleData]);
  // Use trades from tradesResponse if available, otherwise fallback to insights
  const trades = tradesResponse?.ok 
    ? tradesResponse.data.trades 
    : (insightsPayload?.trades || []);
  const metrics = insightsPayload?.metrics;
  
  // Compute valid timestamp range from candles to filter markers
  const candleTimeRange = useMemo(() => {
    if (!candleData.length) return null;
    const timestamps = candleData.map((c) => c.ts).filter(Number.isFinite);
    if (!timestamps.length) return null;
    return {
      minTs: Math.min(...timestamps),
      maxTs: Math.max(...timestamps),
    };
  }, [candleData]);

  const chartMarkers = useMemo<CandlestickMarker[]>(() => {
    // Early return if no candles or no valid time range
    if (!candleData.length || !candleTimeRange || !trades.length) return [];

    return trades
      .filter((trade) => {
        // Filter trades where both entry and exit are within candle range
        const entryValid = 
          Number.isFinite(trade.entryTs) && 
          trade.entryTs >= candleTimeRange.minTs && 
          trade.entryTs <= candleTimeRange.maxTs;
        const exitValid = 
          Number.isFinite(trade.exitTs) && 
          trade.exitTs >= candleTimeRange.minTs && 
          trade.exitTs <= candleTimeRange.maxTs;
        return entryValid && exitValid;
      })
      .flatMap((trade) => {
        // Double-check timestamps are valid before creating markers
        const entryTs = trade.entryTs;
        const exitTs = trade.exitTs;
        
        if (!Number.isFinite(entryTs) || !Number.isFinite(exitTs)) {
          return [];
        }
        
        return [
          {
            time: entryTs,
            position: "belowBar" as const,
            color: "hsl(var(--success))",
            shape: "arrowUp" as const,
            text: "Buy",
            tradeId: trade.id,
            type: "entry" as const,
          },
          {
            time: exitTs,
            position: "aboveBar" as const,
            color: "hsl(var(--danger))",
            shape: "arrowDown" as const,
            text: "Sell",
            tradeId: trade.id,
            type: "exit" as const,
          },
        ];
      });
  }, [trades, candleTimeRange, candleData.length]);

  const formatPrice = (value: number) => value.toFixed(2);
  const formatDateTime = (ts: number) => format(new Date(ts), "MMM d, HH:mm");
  const benchmarkLabel = candlePayload?.symbol ? `${candlePayload.symbol} Benchmark` : "Market Benchmark";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={strategy?.name || "Strategy"}
        subtitle={strategy?.description || undefined}
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
            <div
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center",
                tier === "LOW" ? "bg-positive/10" : tier === "HIGH" ? "bg-negative/10" : "bg-primary/10"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5",
                  tier === "LOW" ? "text-positive" : tier === "HIGH" ? "text-negative" : "text-primary"
                )}
              />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{strategy?.name}</h2>
              <Badge variant="outline" className={cn("text-xs", config.color)}>
                {config.label}
              </Badge>
            </div>
          </div>

          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 mb-6 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Strategy returns can be volatile. Review risk controls below.
            </p>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Performance</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RangeSelector value={range} onChange={setRange} />
                {[
                  { value: "strategy", label: "Strategy" },
                  { value: "benchmark", label: "Benchmark" },
                  { value: "both", label: "Both" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant={performanceView === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPerformanceView(option.value as "strategy" | "benchmark" | "both")}
                    data-testid={`button-performance-${option.value}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            {perfLoading ? (
              <div style={{ height: 360 }}>
                <ChartSkeleton height={360} />
              </div>
            ) : perfError ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Unable to load performance data. Please try again shortly.
              </div>
            ) : strategyData.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No performance data available for this range.
              </div>
            ) : (
              <div className="space-y-3">
                <CompareChart
                  strategyData={strategyData}
                  benchmarkData={benchmarkData}
                  strategyName={strategy?.name || "Strategy"}
                  benchmarkName={benchmarkLabel}
                  height={360}
                  mode={performanceView}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {periodDays}D · {strategyData.length} points
                  </span>
                  <span className="tabular-nums">
                    Latest index: {lastStrategyValue.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Market Activity</h3>
                {candlePayload?.symbol && (
                  <Badge variant="outline" className="text-xs">
                    {candlePayload.symbol}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={chartTimeframe} onValueChange={(value) => setChartTimeframe(value as Timeframe)}>
                  <SelectTrigger className="w-[96px]" data-testid="select-timeframe">
                    <SelectValue placeholder="Timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeframeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <RangeSelector value={range} onChange={setRange} />
              </div>
            </div>
            {candlesLoading ? (
              <div style={{ height: 360 }}>
                <ChartSkeleton height={360} />
              </div>
            ) : candlesError ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Unable to load market data. Please try again shortly.
              </div>
            ) : candleData.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No candles available for this range. Try a shorter period.
              </div>
            ) : (
              <div className="space-y-3">
                <CandlestickChart 
                  candles={candleData} 
                  markers={chartMarkers} 
                  height={360}
                  onMarkerClick={handleMarkerClick}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {periodDays}D · {candleData.length} candles · {candlePayload?.source ?? "source"}
                  </span>
                  {candleData[candleData.length - 1] && (
                    <span className="tabular-nums">
                      Last close: {formatPrice(candleData[candleData.length - 1].close)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Strategy Metrics</h3>
              </div>
              {insightsLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-20 rounded-xl" />
                  ))}
                </div>
              ) : insightsError ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Unable to load strategy metrics right now.
                </div>
              ) : metrics ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Total Trades</p>
                    <p className="text-xl font-semibold tabular-nums">{metrics.totalTrades}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
                    <p className="text-xl font-semibold tabular-nums">{metrics.winRatePct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Net P&amp;L</p>
                    <p
                      className={cn(
                        "text-xl font-semibold tabular-nums",
                        metrics.netPnl >= 0 ? "text-positive" : "text-negative"
                      )}
                    >
                      {metrics.netPnl >= 0 ? "+" : ""}
                      {metrics.netPnl.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Net P&amp;L %</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {metrics.netPnlPct >= 0 ? "+" : ""}
                      {metrics.netPnlPct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Avg Hold</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {metrics.avgHoldBars.toFixed(1)} bars
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Profit Factor</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {metrics.profitFactor === Number.POSITIVE_INFINITY
                        ? "∞"
                        : metrics.profitFactor.toFixed(2)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Metrics will appear once data is available.
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Trade Tape</h3>
                </div>
                <Badge variant="outline" className="text-xs">
                  {trades.length} trades
                </Badge>
              </div>
              {insightsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : insightsError ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Unable to load trade history.
                </div>
              ) : trades.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No trades for this window yet.
                </div>
              ) : (
                <ScrollArea className="h-[280px] pr-3">
                  <div className="hidden md:grid grid-cols-6 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                    <span className="col-span-2">Exit</span>
                    <span>Side</span>
                    <span>Entry</span>
                    <span>Exit</span>
                    <span>P&amp;L</span>
                  </div>
                  <div className="space-y-2">
                    {trades.map((trade) => (
                      <div
                        key={trade.id}
                        className="grid grid-cols-2 md:grid-cols-6 gap-2 items-center rounded-lg border border-border/60 p-3 text-xs"
                      >
                        <span className="col-span-2 md:col-span-2 text-muted-foreground">
                          {formatDateTime(trade.exitTs)}
                        </span>
                        <Badge variant="outline" className="w-fit text-[10px] uppercase">
                          Long
                        </Badge>
                        <span className="tabular-nums text-muted-foreground">{formatPrice(trade.entryPrice)}</span>
                        <span className="tabular-nums text-muted-foreground">{formatPrice(trade.exitPrice)}</span>
                        <span
                          className={cn(
                            "tabular-nums font-medium",
                            trade.netPnl >= 0 ? "text-positive" : "text-negative"
                          )}
                        >
                          {trade.netPnl >= 0 ? "+" : ""}
                          {trade.netPnl.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Calculator</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              See what your investment would have returned over the selected {periodDays}-day period.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="amount">Initial Investment (USDT)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1"
                  data-testid="input-amount"
                />
              </div>
              <div className="flex flex-col justify-end">
                <Label className="text-muted-foreground">Final Value</Label>
                <p className="text-2xl font-bold tabular-nums">{result.toFixed(2)} USDT</p>
              </div>
              <div className="flex flex-col justify-end">
                <Label className="text-muted-foreground">Profit / Loss</Label>
                <p className={cn("text-2xl font-bold tabular-nums", pnl >= 0 ? "text-positive" : "text-negative")}>
                  {pnl >= 0 ? "+" : ""}
                  {pnl.toFixed(2)} USDT
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Results may vary. Investment returns can be negative.
            </p>
          </Card>

          {/* Payouts Section */}
          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Payout Settings</h3>
            </div>

            <div className="space-y-5">
              {/* Frequency Toggle */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Payout Frequency</Label>
                <div className="flex gap-2">
                  <Button
                    variant={payoutFrequency === "DAILY" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPayoutFrequency("DAILY")}
                    data-testid="button-frequency-daily"
                  >
                    Daily
                  </Button>
                  <Button
                    variant={payoutFrequency === "MONTHLY" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPayoutFrequency("MONTHLY")}
                    data-testid="button-frequency-monthly"
                  >
                    Monthly
                  </Button>
                </div>
              </div>

              {/* Address Selection */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Payout Address (TRC20)</Label>
                {hasActiveAddress ? (
                  <Select value={payoutAddressId} onValueChange={setPayoutAddressId}>
                    <SelectTrigger data-testid="select-payout-address">
                      <SelectValue placeholder="Select address" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAddresses.map((addr) => (
                        <SelectItem key={addr.id} value={addr.id}>
                          <span className="font-mono text-xs">
                            {addr.label ? `${addr.label}: ` : ""}
                            {addr.address.slice(0, 8)}...{addr.address.slice(-6)}
                          </span>
                        </SelectItem>
                      ))}
                      {pendingAddresses.map((addr) => (
                        <SelectItem key={addr.id} value={addr.id} disabled>
                          <span className="font-mono text-xs text-muted-foreground">
                            {addr.label ? `${addr.label}: ` : ""}
                            {addr.address.slice(0, 8)}...{addr.address.slice(-6)}
                            <span className="ml-2 text-warning">
                              (activates {addr.activatesAt ? new Date(addr.activatesAt).toLocaleDateString() : "..."})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-4 border border-dashed rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-3">No active payout addresses</p>
                    <Link href="/settings/security">
                      <Button variant="outline" size="sm" data-testid="button-add-address">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Add address
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Min Payout Amount */}
              <div>
                <Label htmlFor="min-payout" className="text-sm text-muted-foreground mb-2 block">
                  Minimum Payout Amount (USDT)
                </Label>
                <Input
                  id="min-payout"
                  type="number"
                  min="1"
                  step="1"
                  value={payoutMinAmount}
                  onChange={(e) => setPayoutMinAmount(e.target.value)}
                  className="max-w-[200px]"
                  data-testid="input-min-payout"
                />
              </div>

              {/* Active Switch */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Auto-Payout Profits</p>
                  <p className="text-xs text-muted-foreground">Automatically send profits to the selected address</p>
                </div>
                <Switch
                  checked={payoutActive}
                  onCheckedChange={setPayoutActive}
                  disabled={!hasActiveAddress}
                  data-testid="switch-payout-active"
                />
              </div>

              {/* Info Messages */}
              <div className="space-y-2">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Network fee (1 USDT) is deducted from each payout.</span>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>If the post-fee amount is below the threshold, profits roll over to the next payout.</span>
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSavePayout}
                disabled={savePayoutMutation.isPending}
                className="w-full"
                data-testid="button-save-payout"
              >
                {savePayoutMutation.isPending ? "Saving..." : "Save payout settings"}
              </Button>
            </div>
          </Card>

          {/* Risk Controls Section */}
          {riskControls?.hasPosition && (
            <Card className="p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="w-5 h-5 text-warning" />
                <h3 className="text-lg font-semibold">Risk Controls</h3>
              </div>

              {/* Paused Banner */}
              {riskControls.paused && (
                <div
                  className={cn(
                    "p-3 rounded-lg mb-4 flex items-center justify-between",
                    riskControls.pausedReason === "dd_breach"
                      ? "bg-negative/10 border border-negative/20"
                      : "bg-warning/10 border border-warning/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Pause
                      className={cn(
                        "w-4 h-4",
                        riskControls.pausedReason === "dd_breach" ? "text-negative" : "text-warning"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        riskControls.pausedReason === "dd_breach" ? "text-negative" : "text-warning"
                      )}
                    >
                      {riskControls.pausedReason === "dd_breach"
                        ? "Auto-paused due to drawdown limit breach"
                        : "Strategy is manually paused"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pauseMutation.mutate(false)}
                    disabled={pauseMutation.isPending}
                    data-testid="button-resume-strategy"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                </div>
              )}

              {/* Current Drawdown */}
              {riskControls.currentDrawdownPct > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 mb-4">
                  <p className="text-sm text-muted-foreground">Current Drawdown</p>
                  <p
                    className={cn(
                      "text-xl font-semibold tabular-nums",
                      riskControls.currentDrawdownPct >= (riskControls.ddLimitPct || 100)
                        ? "text-negative"
                        : "text-warning"
                    )}
                  >
                    -{riskControls.currentDrawdownPct.toFixed(1)}%
                  </p>
                </div>
              )}

              <div className="space-y-5">
                {/* Pause Toggle */}
                {!riskControls.paused && (
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">Pause Strategy</p>
                      <p className="text-xs text-muted-foreground">Stop accrual and block new investments</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pauseMutation.mutate(true)}
                      disabled={pauseMutation.isPending}
                      data-testid="button-pause-strategy"
                    >
                      <Pause className="w-4 h-4 mr-1" />
                      Pause
                    </Button>
                  </div>
                )}

                {/* DD Limit Slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Drawdown Limit</Label>
                    <span className="text-sm font-medium tabular-nums">{ddLimitPct === 0 ? "Off" : `${ddLimitPct}%`}</span>
                  </div>
                  <Slider
                    value={[ddLimitPct]}
                    onValueChange={(v) => setDdLimitPct(v[0])}
                    min={0}
                    max={50}
                    step={5}
                    className="w-full"
                    data-testid="slider-dd-limit"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum allowed loss from initial investment (0 = no limit)
                  </p>
                </div>

                {/* Auto-Pause Toggle */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">Auto-Pause on Breach</p>
                    <p className="text-xs text-muted-foreground">Automatically pause if drawdown exceeds limit</p>
                  </div>
                  <Switch
                    checked={autoPauseEnabled}
                    onCheckedChange={setAutoPauseEnabled}
                    disabled={ddLimitPct === 0}
                    data-testid="switch-auto-pause"
                  />
                </div>

                {/* Info Message */}
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>When a strategy is paused, no daily returns are accrued and new investments are blocked.</span>
                </div>

                {/* Save Button */}
                <Button
                  onClick={handleSaveRiskControls}
                  disabled={riskControlsMutation.isPending}
                  className="w-full"
                  data-testid="button-save-risk-controls"
                >
                  {riskControlsMutation.isPending ? "Saving..." : "Save Risk Settings"}
                </Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Monthly Range</p>
              <p className="text-xl font-semibold text-positive">{minReturn}% - {maxReturn}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Worst Month</p>
              <p className="text-xl font-semibold text-negative">{strategy?.worstMonth || "N/A"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Max Drawdown</p>
              <p className="text-xl font-semibold text-negative">{strategy?.maxDrawdown || "N/A"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase">Min Investment</p>
              <p className="text-xl font-semibold tabular-nums">
                {minInvestmentMajor.toLocaleString()}{" "}
                <span className="text-sm font-medium text-muted-foreground">USDT</span>
              </p>
            </Card>
          </div>

          <Card className="p-5 mb-6">
            <h3 className="text-lg font-semibold mb-4">Strategy Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Trading Pairs</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {pairs.map((pair: string) => (
                    <Badge key={pair} variant="outline" className="text-xs">
                      {pair}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fees</p>
                <p className="text-sm">
                  Management Fee: {fees?.management || "0.5%"} | Performance Fee: {fees?.performance || "10%"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Profit Payout</p>
                <p className="text-sm">{terms?.profitPayout === "DAILY" ? "Daily" : "Monthly"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Principal Redemption</p>
                <p className="text-sm">Weekly Window</p>
              </div>
            </div>
          </Card>

          <Link href={`/invest/${params.id}/confirm`}>
            <Button className="w-full min-h-[44px]" data-testid="button-invest">
              Invest in {strategy?.name}
            </Button>
          </Link>
        </>
      )}

      {/* Trade Details Sheet */}
      <Sheet open={tradeDetailsOpen} onOpenChange={setTradeDetailsOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Trade Details</SheetTitle>
            <SheetDescription>
              Timeline and breakdown of trade execution
            </SheetDescription>
          </SheetHeader>
          
          {selectedTradeId && (
            <TradeDetailsContent
              tradeId={selectedTradeId}
              trades={tradesResponse?.ok 
                ? tradesResponse.data.trades 
                : (insightsPayload?.trades || [])}
              events={tradeEventsResponse?.ok ? tradeEventsResponse.data.events : []}
              loading={tradeEventsLoading}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// Trade Details Component
function TradeDetailsContent({ 
  tradeId, 
  trades, 
  events, 
  loading 
}: { 
  tradeId: string; 
  trades: any[]; 
  events: any[]; 
  loading: boolean;
}) {
  const trade = trades.find((t) => t.id === tradeId);
  
  if (!trade) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Trade not found
      </div>
    );
  }

  const sortedEvents = [...events].sort((a, b) => a.ts - b.ts);
  const entryEvent = sortedEvents.find((e) => e.type === "FILLED");
  const exitEvent = sortedEvents.find((e) => e.type === "CLOSED");
  
  const fee = parseFloat(trade.feesMinor || "0") / 1_000_000;
  const slippage = 0; // TODO: calculate from events
  const netPnl = trade.netPnl || 0;

  return (
    <div className="mt-6 space-y-6">
      {/* Trade Summary */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Entry Price</span>
          <span className="text-sm font-medium tabular-nums">
            ${trade.entryPrice?.toFixed(2) || "0.00"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Exit Price</span>
          <span className="text-sm font-medium tabular-nums">
            ${trade.exitPrice?.toFixed(2) || "0.00"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Quantity</span>
          <span className="text-sm font-medium tabular-nums">
            {trade.qty?.toFixed(4) || "0.0000"}
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Fee</span>
          <span className="text-sm font-medium tabular-nums">
            ${fee.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Slippage</span>
          <span className="text-sm font-medium tabular-nums">
            ${slippage.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Net P&L</span>
          <span className={cn(
            "text-sm font-semibold tabular-nums",
            netPnl >= 0 ? "text-positive" : "text-negative"
          )}>
            {netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)}
          </span>
        </div>
      </div>

      <Separator />

      {/* Timeline */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Timeline</h3>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No events available
          </div>
        ) : (
          <div className="space-y-3">
          {sortedEvents.map((event, index) => (
            <div key={event.id || index} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  event.type === "TRADE_INTENT" ? "bg-blue-500" :
                  event.type === "ORDER_PLACED" ? "bg-yellow-500" :
                  event.type === "FILLED" ? "bg-green-500" :
                  event.type === "CLOSED" ? "bg-red-500" : "bg-gray-500"
                )} />
                {index < sortedEvents.length - 1 && (
                  <div className="w-px h-8 bg-border mt-1" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {event.type === "TRADE_INTENT" ? "Trade Intent" :
                     event.type === "ORDER_PLACED" ? "Order Placed" :
                     event.type === "FILLED" ? "Filled" :
                     event.type === "CLOSED" ? "Closed" : event.type}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(new Date(event.ts), "MMM d, HH:mm:ss")}
                  </span>
                </div>
                {event.payloadJson && (
                  <div className="text-xs text-muted-foreground">
                    {event.type === "FILLED" || event.type === "CLOSED" ? (
                      <>
                        Price: ${event.payloadJson.price?.toFixed(2) || "0.00"} · 
                        Qty: {event.payloadJson.qty?.toFixed(4) || "0.0000"}
                      </>
                    ) : event.type === "TRADE_INTENT" ? (
                      <>
                        Intended: ${event.payloadJson.intendedPrice?.toFixed(2) || "0.00"} · 
                        {event.payloadJson.reason || ""}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
