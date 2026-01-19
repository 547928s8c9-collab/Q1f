import { useState, useEffect, useMemo } from "react";
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
  type Candle,
  type InvestMetrics,
  type InvestTrade,
  type Strategy,
  type StrategyPerformance,
  type PayoutInstruction,
  type WhitelistAddress,
  type Timeframe,
  formatMoney,
} from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const riskConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  LOW: { color: "bg-positive/10 text-positive border-positive/20", icon: Shield, label: "Low Risk" },
  CORE: { color: "bg-warning/10 text-warning border-warning/20", icon: TrendingUp, label: "Core" },
  HIGH: { color: "bg-negative/10 text-negative border-negative/20", icon: Zap, label: "High Risk" },
};

const timeframeOptions: { value: Timeframe; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
];

const periodOptions: Array<{ value: 7 | 30 | 90; label: string }> = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
];

interface InvestCandlesResponse {
  candles: Candle[];
  gaps: { startMs: number; endMs: number; reason: string }[];
  source: string;
  symbol: string;
  timeframe: Timeframe;
  periodDays: number;
}

interface InvestInsightsResponse {
  trades: InvestTrade[];
  metrics: InvestMetrics;
  timeframe: Timeframe;
  periodDays: number;
  symbol: string;
}

export default function StrategyDetail() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>("15m");
  const [amount, setAmount] = useState("1000");

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

  const { data: performance, isLoading: perfLoading } = useQuery<StrategyPerformance[]>({
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
      { timeframe: chartTimeframe, period: periodDays.toString() },
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
      { timeframe: chartTimeframe, period: periodDays.toString() },
    ],
    enabled: !!params.id,
  });

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
      toast({ title: "Настройки выплат сохранены" });
    },
    onError: (error: Error & { code?: string }) => {
      toast({
        title: "Ошибка сохранения",
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  const baseValue = filteredPerf[0]?.equityMinor ? parseFloat(filteredPerf[0].equityMinor) : 1000000000;

  const strategyData = filteredPerf.map((p) => ({
    date: p.date,
    value: (parseFloat(p.equityMinor) / baseValue) * 100,
  }));

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

  const candleData = candleResponse?.candles ?? [];
  const trades = insightsResponse?.trades ?? [];
  const metrics = insightsResponse?.metrics;
  const chartMarkers = useMemo<CandlestickMarker[]>(() => {
    if (!trades.length) return [];

    return trades.flatMap((trade) => [
      {
        time: trade.entryTs,
        position: "belowBar",
        color: "hsl(var(--success))",
        shape: "arrowUp",
        text: "Buy",
      },
      {
        time: trade.exitTs,
        position: "aboveBar",
        color: "hsl(var(--danger))",
        shape: "arrowDown",
        text: "Sell",
      },
    ]);
  }, [trades]);

  const formatPrice = (value: number) => value.toFixed(2);
  const formatDateTime = (ts: number) => format(new Date(ts), "MMM d, HH:mm");

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
          </div>

          <Card className="p-5 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Market Activity</h3>
                {candleResponse?.symbol && (
                  <Badge variant="outline" className="text-xs">
                    {candleResponse.symbol}
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
                <Select value={String(periodDays)} onValueChange={(value) => setPeriodDays(Number(value) as 7 | 30 | 90)}>
                  <SelectTrigger className="w-[96px]" data-testid="select-period">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periodOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {candlesLoading ? (
              <ChartSkeleton height={360} />
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
                <CandlestickChart candles={candleData} markers={chartMarkers} height={360} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {periodDays}D · {candleData.length} candles · {candleResponse?.source ?? "source"}
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
                  <h3 className="text-lg font-semibold">Trades Tape</h3>
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
                <Label className="text-muted-foreground">Profit/Loss</Label>
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
              <h3 className="text-lg font-semibold">Настройки выплат</h3>
            </div>

            <div className="space-y-5">
              {/* Frequency Toggle */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Частота выплат</Label>
                <div className="flex gap-2">
                  <Button
                    variant={payoutFrequency === "DAILY" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPayoutFrequency("DAILY")}
                    data-testid="button-frequency-daily"
                  >
                    Ежедневно
                  </Button>
                  <Button
                    variant={payoutFrequency === "MONTHLY" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPayoutFrequency("MONTHLY")}
                    data-testid="button-frequency-monthly"
                  >
                    Ежемесячно
                  </Button>
                </div>
              </div>

              {/* Address Selection */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Адрес для выплат (TRC20)</Label>
                {hasActiveAddress ? (
                  <Select value={payoutAddressId} onValueChange={setPayoutAddressId}>
                    <SelectTrigger data-testid="select-payout-address">
                      <SelectValue placeholder="Выберите адрес" />
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
                              (активируется {addr.activatesAt ? new Date(addr.activatesAt).toLocaleDateString() : "..."})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-4 border border-dashed rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-3">Нет активных адресов для выплат</p>
                    <Link href="/settings/security">
                      <Button variant="outline" size="sm" data-testid="button-add-address">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Добавить адрес
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Min Payout Amount */}
              <div>
                <Label htmlFor="min-payout" className="text-sm text-muted-foreground mb-2 block">
                  Минимальная сумма выплаты (USDT)
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
                  <p className="font-medium">Автовыплата профита</p>
                  <p className="text-xs text-muted-foreground">
                    Автоматически выплачивать прибыль на выбранный адрес
                  </p>
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
                  <span>Комиссия сети (1 USDT) вычитается из выплаты.</span>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Если сумма после комиссии меньше порога — прибыль копится до следующей выплаты.</span>
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSavePayout}
                disabled={savePayoutMutation.isPending}
                className="w-full"
                data-testid="button-save-payout"
              >
                {savePayoutMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
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
              <p className="text-xl font-semibold">100 USDT</p>
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
                  Management: {fees?.management || "0.5%"} | Performance: {fees?.performance || "10%"}
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
    </div>
  );
}
