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
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import {
  ActionSheet,
  ConfirmStep,
  ResultStep,
  useActionSheet,
} from "./action-sheet";

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
  minInvestment: string;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-positive/10 text-positive",
  CORE: "bg-primary/10 text-primary",
  HIGH: "bg-warning/10 text-warning",
};

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
      title="Invest"
      description="Put your USDT to work"
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
  const [strategyId, setStrategyId] = useState(preselectedStrategyId || "");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const selectedStrategy = strategies.find((s) => s.id === strategyId);
  const availableBalance = bootstrap?.balances.USDT.available || "0";

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
    if (!strategyId) {
      setError("Please select a strategy");
      return;
    }
    const minVal = BigInt(selectedStrategy?.minInvestment || "10000000");
    const maxVal = BigInt(availableBalance);
    
    if (BigInt(minorAmount) < minVal) {
      setError(`Minimum investment is ${formatMoney(selectedStrategy?.minInvestment || "10000000", "USDT")} USDT`);
      return;
    }
    if (BigInt(minorAmount) > maxVal) {
      setError("Insufficient balance");
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
      setStatus("success");
      setOperationId(data.operation?.id || null);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/positions"] });
      toast({
        title: "Investment successful",
        description: `${formatMoney(minorAmount, "USDT")} USDT invested in ${selectedStrategy?.name}`,
      });
    },
    onError: (error: Error) => {
      setStatus("failed");
      setStep("result");
      toast({
        title: "Investment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { step: currentStep } = useActionSheet();
  const statusKey = currentStep === "result" 
    ? (investMutation.isError ? "failed" : "success") 
    : "success";

  const statusMessages = {
    success: {
      title: "Investment Complete",
      message: `${formatMoney(minorAmount, "USDT")} USDT is now working for you in ${selectedStrategy?.name || "your chosen strategy"}.`,
    },
    pending: {
      title: "Investment Processing",
      message: "Your investment is being processed.",
    },
    failed: {
      title: "Investment Failed",
      message: investMutation.error?.message || "Something went wrong. Please try again.",
    },
  };

  return (
    <>
      {step === "amount" && (
        <div className="space-y-4">
          <div>
            <Label>Strategy</Label>
            <Select value={strategyId} onValueChange={setStrategyId}>
              <SelectTrigger className="mt-1.5" data-testid="select-strategy">
                <SelectValue placeholder="Select a strategy" />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <span>{s.name}</span>
                      <Badge
                        variant="outline"
                        className={RISK_COLORS[s.riskTier] || ""}
                      >
                        {s.riskTier}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStrategy && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Return</span>
                <span className="font-medium">{selectedStrategy.expectedMonthlyRange}/mo</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Min Investment</span>
                <span className="font-medium">{formatMoney(selectedStrategy.minInvestment, "USDT")} USDT</span>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="amount">Amount</Label>
            <div className="relative mt-1.5">
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="100.00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="text-2xl font-semibold pr-20 tabular-nums"
                data-testid="input-amount"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-muted-foreground text-sm">USDT</span>
              </div>
            </div>
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <button
              type="button"
              onClick={setMax}
              className="text-primary hover:underline font-medium"
              data-testid="button-max-amount"
            >
              {formatMoney(availableBalance, "USDT")} USDT
            </button>
          </div>

          <Button
            className="w-full"
            onClick={handleNext}
            disabled={!amount || amount === "0" || !strategyId}
            data-testid="button-next-step"
          >
            Continue
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
          { label: "Strategy", value: selectedStrategy?.name || "" },
          { label: "Risk Tier", value: selectedStrategy?.riskTier || "" },
          { label: "Expected Return", value: selectedStrategy?.expectedMonthlyRange + "/mo" || "" },
        ]}
        ctaLabel="Invest"
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
