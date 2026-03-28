import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatMoney, type BootstrapResponse } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  ActionSheet,
  ConfirmStep,
  ResultStep,
  useActionSheet,
} from "./action-sheet";
import { TIER_META, type RiskTierKey, computeTierStats } from "@/components/strategy/tier-card";

interface InvestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrap: BootstrapResponse | undefined;
  preselectedStrategyId?: string;
}

interface Strategy {
  id: string;
  name: string;
  riskTier: string;
  expectedMonthlyRange: string;
  expectedMonthlyRangeBpsMin?: number;
  expectedMonthlyRangeBpsMax?: number;
  minInvestment: string;
}

export function InvestSheet({
  open,
  onOpenChange,
  bootstrap,
  preselectedStrategyId,
}: InvestSheetProps) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Инвестировать"
      description="Заставьте ваши USDT работать"
      hideStepIndicator
    >
      <InvestFlow
        bootstrap={bootstrap}
        onClose={() => onOpenChange(false)}
        preselectedStrategyId={preselectedStrategyId}
      />
    </ActionSheet>
  );
}

function InvestFlow({
  bootstrap,
  onClose,
  preselectedStrategyId,
}: {
  bootstrap: BootstrapResponse | undefined;
  onClose: () => void;
  preselectedStrategyId?: string;
}) {
  const { step, setStep, amount, setAmount, setStatus, setOperationId } = useActionSheet();
  const [, setLocation] = useLocation();
  const [selectedTier, setSelectedTier] = useState<RiskTierKey | "">("");
  const [strategyId, setStrategyId] = useState(preselectedStrategyId || "");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  // Group strategies by tier
  const strategiesByTier = useMemo(() => {
    const grouped: Record<RiskTierKey, Strategy[]> = { LOW: [], CORE: [], HIGH: [] };
    strategies.forEach((s) => {
      const tier = (s.riskTier || "CORE") as RiskTierKey;
      if (grouped[tier]) grouped[tier].push(s);
    });
    return grouped;
  }, [strategies]);

  // Auto-detect tier from preselected strategy
  useMemo(() => {
    if (preselectedStrategyId && strategies.length > 0) {
      const s = strategies.find((s) => s.id === preselectedStrategyId);
      if (s) {
        const tier = (s.riskTier || "CORE") as RiskTierKey;
        setSelectedTier(tier);
        setStrategyId(s.id);
      }
    }
  }, [preselectedStrategyId, strategies]);

  // When tier changes, select first strategy in that tier
  const handleTierChange = (tier: RiskTierKey) => {
    setSelectedTier(tier);
    const tierStrategies = strategiesByTier[tier];
    if (tierStrategies.length > 0) {
      setStrategyId(tierStrategies[0].id);
    }
    setError("");
  };

  const selectedStrategy = strategies.find((s) => s.id === strategyId);
  const availableBalance = bootstrap?.balances?.USDT?.available || "0";

  // Compute expected return for selected tier
  const tierStats = selectedTier ? computeTierStats(strategiesByTier[selectedTier] || []) : null;

  const toMinorUnits = (displayValue: string): string => {
    if (!displayValue || displayValue === ".") return "0";
    const parts = displayValue.split(".");
    const whole = parts[0] || "0";
    const fraction = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    return BigInt(whole + fraction).toString();
  };

  const minorAmount = toMinorUnits(amount);
  const balanceAfter = (BigInt(availableBalance) - BigInt(minorAmount || "0")).toString();

  const handleAmountChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, "");
    const parts = cleanValue.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 6) return;
    setAmount(cleanValue);
    setError("");
  };

  const handleNext = () => {
    if (!selectedTier) {
      setError("Выберите уровень риска");
      return;
    }
    const minVal = BigInt(selectedStrategy?.minInvestment || "10000000");
    const maxVal = BigInt(availableBalance);

    if (BigInt(minorAmount) < minVal) {
      setError(`Минимальная инвестиция: ${formatMoney(selectedStrategy?.minInvestment || "10000000", "USDT")} USDT`);
      return;
    }
    if (BigInt(minorAmount) > maxVal) {
      setError("Недостаточный баланс");
      return;
    }
    setStep("confirm");
  };

  const setMax = () => {
    const maxMinor = BigInt(availableBalance);
    if (maxMinor <= 0n) {
      setAmount("0");
      return;
    }
    const divisor = BigInt(1000000);
    const whole = maxMinor / divisor;
    const fraction = maxMinor % divisor;
    const fractionStr = fraction.toString().padStart(6, "0");
    setAmount(`${whole}.${fractionStr}`);
    setError("");
  };

  const investMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invest", {
        strategyId,
        amount: minorAmount,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || "Investment failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      const tierName = selectedTier ? TIER_META[selectedTier].name : selectedStrategy?.name;
      toast({
        title: "Инвестиция выполнена",
        description: `${formatMoney(minorAmount, "USDT")} USDT инвестировано в «${tierName}»`,
      });
      onClose();
      setLocation("/");
    },
    onError: (error: Error) => {
      setStatus("failed");
      setStep("result");
      toast({
        title: "Ошибка инвестиции",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { step: currentStep } = useActionSheet();
  const statusKey = currentStep === "result"
    ? (investMutation.isError ? "failed" : "success")
    : "success";

  const tierName = selectedTier ? TIER_META[selectedTier].name : selectedStrategy?.name || "выбранной стратегии";

  const statusMessages = {
    success: {
      title: "Инвестиция выполнена",
      message: `${formatMoney(minorAmount, "USDT")} USDT теперь работает на вас в «${tierName}».`,
    },
    pending: {
      title: "Инвестиция обрабатывается",
      message: "Ваша инвестиция обрабатывается.",
    },
    failed: {
      title: "Ошибка инвестиции",
      message: investMutation.error?.message || "Что-то пошло не так. Попробуйте снова.",
    },
  };

  return (
    <>
      {step === "amount" && (
        <div className="space-y-4">
          <div>
            <Label style={{ fontSize: 13, color: "#86868B" }}>Уровень риска</Label>
            <Select value={selectedTier} onValueChange={(v) => handleTierChange(v as RiskTierKey)}>
              <SelectTrigger className="mt-1.5" style={{ borderRadius: 12, height: 48 }} data-testid="select-strategy">
                <SelectValue placeholder="Выберите уровень" />
              </SelectTrigger>
              <SelectContent>
                {(["LOW", "CORE", "HIGH"] as RiskTierKey[]).map((tierKey) => {
                  const meta = TIER_META[tierKey];
                  const tierStrats = strategiesByTier[tierKey];
                  if (tierStrats.length === 0) return null;
                  return (
                    <SelectItem key={tierKey} value={tierKey}>
                      <span style={{ fontSize: 15, color: "#1D1D1F" }}>{meta.name}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedTier && tierStats && (
            <div className="rounded-2xl p-3" style={{ backgroundColor: "#F5F5F7" }}>
              <div className="flex justify-between" style={{ fontSize: 15 }}>
                <span style={{ color: "#86868B" }}>Ожидаемая доходность</span>
                <span className="tabular-nums" style={{ fontWeight: 500, color: "#1D1D1F" }}>
                  {tierStats.returnRangeMin}–{tierStats.returnRangeMax}% /мес
                </span>
              </div>
              <div className="flex justify-between mt-1" style={{ fontSize: 15 }}>
                <span style={{ color: "#86868B" }}>Макс. просадка</span>
                <span className="tabular-nums" style={{ fontWeight: 500, color: "#1D1D1F" }}>
                  {tierStats.maxDrawdown}
                </span>
              </div>
              <div className="flex justify-between mt-1" style={{ fontSize: 15 }}>
                <span style={{ color: "#86868B" }}>Мин. инвестиция</span>
                <span className="tabular-nums" style={{ fontWeight: 500, color: "#1D1D1F" }}>
                  {selectedStrategy ? formatMoney(selectedStrategy.minInvestment, "USDT") : "—"} USDT
                </span>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="amount" style={{ fontSize: 13, color: "#86868B" }}>Сумма</Label>
            <div className="relative mt-1.5">
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="100.00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="text-2xl font-semibold pr-20 tabular-nums"
                style={{ borderRadius: 12, height: 48 }}
                data-testid="input-amount"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span style={{ fontSize: 13, color: "#86868B" }}>USDT</span>
              </div>
            </div>
            {error && <p className="text-sm mt-1" style={{ color: "#FF3B30" }}>{error}</p>}
          </div>

          <div className="flex items-center justify-between" style={{ fontSize: 15 }}>
            <span style={{ color: "#86868B" }}>Доступно</span>
            <button
              type="button"
              onClick={setMax}
              className="font-medium"
              style={{ color: "hsl(var(--primary))" }}
              data-testid="button-max-amount"
            >
              {formatMoney(availableBalance, "USDT")} USDT
            </button>
          </div>

          <Button
            className="w-full font-semibold text-white"
            style={{
              height: 50,
              borderRadius: 12,
              backgroundColor: "hsl(var(--primary))",
              fontSize: 15,
            }}
            onClick={handleNext}
            disabled={!amount || amount === "0" || !selectedTier}
            data-testid="button-next-step"
          >
            Продолжить
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      <ConfirmStep
        asset="USDT"
        balanceBefore={availableBalance}
        balanceAfter={balanceAfter}
        fee="0"
        details={[
          { label: "Уровень риска", value: selectedTier ? TIER_META[selectedTier].name : "" },
          { label: "Ожидаемая доходность", value: tierStats ? `${tierStats.returnRangeMin}–${tierStats.returnRangeMax}% /мес` : "" },
        ]}
        ctaLabel="Инвестировать"
        onConfirm={() => investMutation.mutate()}
        onBack={() => setStep("amount")}
        isLoading={investMutation.isPending}
      />

      <ResultStep
        title={statusMessages[statusKey].title}
        message={statusMessages[statusKey].message}
        onClose={onClose}
      />
    </>
  );
}
