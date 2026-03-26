import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { createIdempotencyKey } from "@/lib/idempotency";
import { formatMoney, type BootstrapResponse } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import {
  ActionSheet,
  ConfirmStep,
  ResultStep,
  useActionSheet,
} from "./action-sheet";

interface WithdrawSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrap: BootstrapResponse | undefined;
}

const NETWORK_FEE = "1000000";

export function WithdrawSheet({ open, onOpenChange, bootstrap }: WithdrawSheetProps) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Вывод USDT"
      description="Отправить средства на внешний кошелёк"
    >
      <WithdrawFlow bootstrap={bootstrap} onClose={() => onOpenChange(false)} />
    </ActionSheet>
  );
}

function WithdrawFlow({
  bootstrap,
  onClose,
}: {
  bootstrap: BootstrapResponse | undefined;
  onClose: () => void;
}) {
  const { step, setStep, amount, setAmount, setStatus, setOperationId } = useActionSheet();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const availableBalance = bootstrap?.balances?.USDT?.available || "0";

  const toMinorUnits = (displayValue: string): string => {
    if (!displayValue || displayValue === ".") return "0";
    const parts = displayValue.split(".");
    const whole = parts[0] || "0";
    const fraction = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    return BigInt(whole + fraction).toString();
  };

  const minorAmount = toMinorUnits(amount);
  const totalDeduction = (BigInt(minorAmount || "0") + BigInt(NETWORK_FEE)).toString();
  const balanceAfterRaw = BigInt(availableBalance) - BigInt(totalDeduction);
  const balanceAfter = (balanceAfterRaw < 0n ? 0n : balanceAfterRaw).toString();

  const appendToAmount = (value: string) => {
    const next = amount + value;
    const parts = next.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 6) return;
    setAmount(next);
    setError("");
  };

  const handleDigit = (digit: string) => {
    appendToAmount(digit);
  };

  const handleDecimal = () => {
    if (amount.includes(".")) return;
    setAmount(amount === "" ? "0." : amount + ".");
  };

  const handleBackspace = () => {
    setAmount(amount.slice(0, -1));
    setError("");
  };

  const handleNext = () => {
    const minVal = BigInt("1000000");
    const availMinusFee = BigInt(availableBalance) - BigInt(NETWORK_FEE);
    const maxVal = availMinusFee > 0n ? availMinusFee : 0n;
    
    if (!address || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) {
      setError("Введите корректный TRC20 адрес (начинается с T, 34 символа)");
      return;
    }
    if (BigInt(minorAmount) < minVal) {
      setError("Минимальный вывод — 1 USDT");
      return;
    }
    if (BigInt(minorAmount) > maxVal) {
      setError("Недостаточный баланс (с учётом комиссии сети)");
      return;
    }
    setStep("confirm");
  };

  const setMax = () => {
    const maxMinor = BigInt(availableBalance) - BigInt(NETWORK_FEE);
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

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/withdraw/usdt", {
        amount: minorAmount,
        address,
      }, {
        headers: { "Idempotency-Key": createIdempotencyKey("wd_usdt") },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || "Withdrawal failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setStatus("pending");
      setOperationId(data.operation?.id || null);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Вывод отправлен",
        description: `Вывод ${formatMoney(minorAmount, "USDT")} USDT обрабатывается`,
      });
    },
    onError: (error: Error) => {
      setStatus("failed");
      setStep("result");
      toast({
        title: "Ошибка вывода",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { step: currentStep } = useActionSheet();
  const statusKey = currentStep === "result" 
    ? (withdrawMutation.isError ? "failed" : "pending") 
    : "pending";

  const statusMessages = {
    success: {
      title: "Вывод выполнен",
      message: `${formatMoney(minorAmount, "USDT")} USDT отправлено.`,
    },
    pending: {
      title: "Вывод обрабатывается",
      message: `Ваш вывод ${formatMoney(minorAmount, "USDT")} USDT обрабатывается.`,
    },
    failed: {
      title: "Ошибка вывода",
      message: withdrawMutation.error?.message || "Что-то пошло не так. Попробуйте снова.",
    },
  };

  return (
    <>
      {step === "amount" && (
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="address">Адрес кошелька</Label>
            <Input
              id="address"
              type="text"
              placeholder="Адрес TRC20 (T...)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 font-mono text-sm"
              data-testid="input-address"
            />
          </div>

          {/* Amount display */}
          <div className="text-center py-3">
            <p className="text-sm text-muted-foreground mb-2">Сумма</p>
            <div className="flex items-baseline justify-center gap-2" data-testid="input-amount">
              <span className="text-5xl font-bold tabular-nums tracking-tight">
                {amount || "0"}
              </span>
              <span className="text-xl text-muted-foreground font-medium">USDT</span>
            </div>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>

          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-muted-foreground">Доступно</span>
            <button
              type="button"
              onClick={setMax}
              className="text-primary hover:underline font-medium"
              data-testid="button-max-amount"
            >
              {formatMoney(availableBalance, "USDT")} USDT
            </button>
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            Комиссия сети: {formatMoney(NETWORK_FEE, "USDT")} USDT
          </div>

          {/* Custom numeric keypad */}
          <NumericKeypad
            onDigit={handleDigit}
            onDecimal={handleDecimal}
            onBackspace={handleBackspace}
            className="mt-1"
          />

          <Button
            className="w-full"
            size="lg"
            onClick={handleNext}
            disabled={!amount || amount === "0" || !address}
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
        fee={NETWORK_FEE}
        details={[
          { label: "Адрес получателя", value: `${address.slice(0, 8)}...${address.slice(-6)}` },
          { label: "Сеть", value: "TRON (TRC20)" },
        ]}
        ctaLabel="Вывести"
        onConfirm={() => withdrawMutation.mutate()}
        onBack={() => setStep("amount")}
        isLoading={withdrawMutation.isPending}
      />

      <ResultStep
        title={statusMessages[statusKey].title}
        message={statusMessages[statusKey].message}
        onClose={onClose}
      />
    </>
  );
}
