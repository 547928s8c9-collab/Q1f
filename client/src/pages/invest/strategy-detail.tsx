import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/ui/page-header";
import { CompareChart } from "@/components/charts/compare-chart";
import { PeriodToggle } from "@/components/charts/period-toggle";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, AlertTriangle, Shield, Zap, Calculator, Wallet, Info, ExternalLink, ShieldAlert, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Strategy, type StrategyPerformance, type PayoutInstruction, type WhitelistAddress, formatMoney } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Benchmark = "BTC" | "ETH" | "USDT" | "INDEX";

const benchmarkOptions: { value: Benchmark; label: string }[] = [
  { value: "BTC", label: "BTC" },
  { value: "ETH", label: "ETH" },
  { value: "USDT", label: "USDT" },
  { value: "INDEX", label: "Index" },
];

const riskConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  LOW: { color: "bg-positive/10 text-positive border-positive/20", icon: Shield, label: "Low Risk" },
  CORE: { color: "bg-warning/10 text-warning border-warning/20", icon: TrendingUp, label: "Core" },
  HIGH: { color: "bg-negative/10 text-negative border-negative/20", icon: Zap, label: "High Risk" },
};

export default function StrategyDetail() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [benchmark, setBenchmark] = useState<Benchmark>("BTC");
  const [demoAmount, setDemoAmount] = useState("1000");
  
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
    queryKey: ["/api/strategies", params.id, "performance"],
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
      active: boolean 
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
        variant: "destructive" 
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

  const activeAddresses = whitelistAddresses?.filter(a => a.status === "ACTIVE") || [];
  const pendingAddresses = whitelistAddresses?.filter(a => a.status === "PENDING_ACTIVATION") || [];
  const hasActiveAddress = activeAddresses.length > 0;

  const isLoading = strategyLoading || perfLoading;

  const tier = strategy?.riskTier || "CORE";
  const config = riskConfig[tier] || riskConfig.CORE;
  const Icon = config.icon;

  const filteredPerf = (performance || []).slice(-period);
  
  const baseValue = filteredPerf[0]?.equityMinor ? parseFloat(filteredPerf[0].equityMinor) : 1000000000;
  
  const strategyData = filteredPerf.map((p) => ({
    date: p.date,
    value: (parseFloat(p.equityMinor) / baseValue) * 100,
  }));

  const getBenchmarkValue = (p: StrategyPerformance, index: number): number => {
    if (benchmark === "USDT") return 100;
    
    const btcBase = filteredPerf[0]?.benchmarkBtcMinor ? parseFloat(filteredPerf[0].benchmarkBtcMinor) : 1000000000;
    const ethBase = filteredPerf[0]?.benchmarkEthMinor ? parseFloat(filteredPerf[0].benchmarkEthMinor) : 1000000000;
    
    if (benchmark === "BTC" && p.benchmarkBtcMinor) {
      return (parseFloat(p.benchmarkBtcMinor) / btcBase) * 100;
    }
    if (benchmark === "ETH" && p.benchmarkEthMinor) {
      return (parseFloat(p.benchmarkEthMinor) / ethBase) * 100;
    }
    if (benchmark === "INDEX" && p.benchmarkBtcMinor && p.benchmarkEthMinor) {
      const btcNorm = (parseFloat(p.benchmarkBtcMinor) / btcBase) * 100;
      const ethNorm = (parseFloat(p.benchmarkEthMinor) / ethBase) * 100;
      return (btcNorm + ethNorm) / 2;
    }
    return 100;
  };

  const benchmarkData = filteredPerf.map((p, i) => ({
    date: p.date,
    value: getBenchmarkValue(p, i),
  }));

  const lastStrategyValue = strategyData[strategyData.length - 1]?.value || 100;
  const strategyReturn = ((lastStrategyValue - 100) / 100) * 100;
  
  const demoAmountNum = parseFloat(demoAmount) || 1000;
  const demoResult = demoAmountNum * (1 + strategyReturn / 100);
  const demoPnL = demoResult - demoAmountNum;

  const minReturn = strategy?.expectedMonthlyRangeBpsMin ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1) : "0";
  const maxReturn = strategy?.expectedMonthlyRangeBpsMax ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1) : "0";

  const pairs = Array.isArray(strategy?.pairsJson) ? strategy.pairsJson : [];
  const fees = strategy?.feesJson as { management?: string; performance?: string } | null;
  const terms = strategy?.termsJson as { profitPayout?: string; principalRedemption?: string } | null;

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
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center",
              tier === "LOW" ? "bg-positive/10" : tier === "HIGH" ? "bg-negative/10" : "bg-primary/10"
            )}>
              <Icon className={cn("w-5 h-5",
                tier === "LOW" ? "text-positive" : tier === "HIGH" ? "text-negative" : "text-primary"
              )} />
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
            <span className="text-sm text-warning">DEMO DATA - Past performance is not indicative of future results. Your investment may lose value.</span>
          </div>

          <Card className="p-5 mb-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold">Performance vs Benchmark</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  {benchmarkOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={benchmark === option.value ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setBenchmark(option.value)}
                      className={cn(
                        "text-xs",
                        benchmark !== option.value && "text-muted-foreground"
                      )}
                      data-testid={`button-benchmark-${option.value.toLowerCase()}`}
                    >
                      {option.label}
                    </Button>
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
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {period}-day return: <span className={strategyReturn >= 0 ? "text-positive" : "text-negative"}>
                {strategyReturn >= 0 ? "+" : ""}{strategyReturn.toFixed(2)}%
              </span>
            </div>
          </Card>

          <Card className="p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Demo Calculator</h3>
              <Badge variant="outline" className="text-xs">DEMO</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              See what your investment would have returned over the selected {period}-day period.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="demo-amount">Initial Investment (USDT)</Label>
                <Input
                  id="demo-amount"
                  type="number"
                  value={demoAmount}
                  onChange={(e) => setDemoAmount(e.target.value)}
                  className="mt-1"
                  data-testid="input-demo-amount"
                />
              </div>
              <div className="flex flex-col justify-end">
                <Label className="text-muted-foreground">Final Value</Label>
                <p className="text-2xl font-bold tabular-nums">{demoResult.toFixed(2)} USDT</p>
              </div>
              <div className="flex flex-col justify-end">
                <Label className="text-muted-foreground">Profit/Loss</Label>
                <p className={cn("text-2xl font-bold tabular-nums", demoPnL >= 0 ? "text-positive" : "text-negative")}>
                  {demoPnL >= 0 ? "+" : ""}{demoPnL.toFixed(2)} USDT
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Result can be negative. This is a simulation based on historical demo data only.
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
                            {addr.label ? `${addr.label}: ` : ""}{addr.address.slice(0, 8)}...{addr.address.slice(-6)}
                          </span>
                        </SelectItem>
                      ))}
                      {pendingAddresses.map((addr) => (
                        <SelectItem key={addr.id} value={addr.id} disabled>
                          <span className="font-mono text-xs text-muted-foreground">
                            {addr.label ? `${addr.label}: ` : ""}{addr.address.slice(0, 8)}...{addr.address.slice(-6)}
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
                    <p className="text-sm text-muted-foreground mb-3">
                      Нет активных адресов для выплат
                    </p>
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
                <div className={cn(
                  "p-3 rounded-lg mb-4 flex items-center justify-between",
                  riskControls.pausedReason === "dd_breach" 
                    ? "bg-negative/10 border border-negative/20" 
                    : "bg-warning/10 border border-warning/20"
                )}>
                  <div className="flex items-center gap-2">
                    <Pause className={cn("w-4 h-4", riskControls.pausedReason === "dd_breach" ? "text-negative" : "text-warning")} />
                    <span className={cn("text-sm font-medium", riskControls.pausedReason === "dd_breach" ? "text-negative" : "text-warning")}>
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
                  <p className={cn(
                    "text-xl font-semibold tabular-nums",
                    riskControls.currentDrawdownPct >= (riskControls.ddLimitPct || 100) ? "text-negative" : "text-warning"
                  )}>
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
                      <p className="text-xs text-muted-foreground">
                        Stop accrual and block new investments
                      </p>
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
                    <span className="text-sm font-medium tabular-nums">
                      {ddLimitPct === 0 ? "Off" : `${ddLimitPct}%`}
                    </span>
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
                    <p className="text-xs text-muted-foreground">
                      Automatically pause if drawdown exceeds limit
                    </p>
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
                    <Badge key={pair} variant="outline" className="text-xs">{pair}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fees</p>
                <p className="text-sm">Management: {fees?.management || "0.5%"} | Performance: {fees?.performance || "10%"}</p>
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
