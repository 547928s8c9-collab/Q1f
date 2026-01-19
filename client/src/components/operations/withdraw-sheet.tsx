import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getMaxWithdrawableMinor, getTotalDeductMinor } from "@/lib/withdrawal";
import { formatMoney, parseMoney, type BootstrapResponse } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
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
      title="Withdraw USDT"
      description="Send funds to an external wallet"
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

  const availableBalance = bootstrap?.balances.USDT.available || "0";
  const networkFeeMinor = bootstrap?.config?.networkFee || NETWORK_FEE;
  const minWithdrawalMinor = bootstrap?.config?.minWithdrawal || "0";

  const minorAmount = amount ? parseMoney(amount, "USDT") : "0";
  const totalDeduction = getTotalDeductMinor(minorAmount || "0", networkFeeMinor);
  const maxWithdrawableMinor = getMaxWithdrawableMinor(availableBalance, networkFeeMinor);
  const balanceAfter = (BigInt(availableBalance) - BigInt(totalDeduction)).toString();

  const handleAmountChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, "");
    const parts = cleanValue.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 6) return;
    setAmount(cleanValue);
    setError("");
  };

  const handleNext = () => {
    const minVal = BigInt(minWithdrawalMinor);
    const maxVal = BigInt(getMaxWithdrawableMinor(availableBalance, networkFeeMinor));
    
    if (!address || address.length < 30) {
      setError("Please enter a valid wallet address");
      return;
    }
    if (BigInt(minorAmount) < minVal) {
      setError(`Minimum withdrawal is ${formatMoney(minWithdrawalMinor, "USDT")} USDT`);
      return;
    }
    if (BigInt(minorAmount) > maxVal) {
      setError("Insufficient balance (including network fee)");
      return;
    }
    setStep("confirm");
  };

  const setMax = () => {
    setAmount(formatMoney(maxWithdrawableMinor, "USDT"));
    setError("");
  };

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const idempotencyKey = crypto.randomUUID();
      const res = await apiRequest("POST", "/api/withdraw/usdt", {
        amount: minorAmount,
        address,
      }, {
        headers: { "Idempotency-Key": idempotencyKey },
      });
      return res.json();
    },
    onSuccess: (data) => {
      setStatus("pending");
      setOperationId(data.operationId || data.operation?.id || null);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({
        title: "Withdrawal submitted",
        description: `${formatMoney(minorAmount, "USDT")} USDT withdrawal is processing`,
      });
    },
    onError: (error: Error) => {
      setStatus("failed");
      setStep("result");
      toast({
        title: "Withdrawal failed",
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
      title: "Withdrawal Complete",
      message: `${formatMoney(minorAmount, "USDT")} USDT has been sent.`,
    },
    pending: {
      title: "Withdrawal Processing",
      message: `Your withdrawal of ${formatMoney(minorAmount, "USDT")} USDT is being processed.`,
    },
    failed: {
      title: "Withdrawal Failed",
      message: withdrawMutation.error?.message || "Something went wrong. Please try again.",
    },
  };

  return (
    <>
      {step === "amount" && (
        <div className="space-y-4">
          <div>
            <Label htmlFor="address">Wallet Address</Label>
            <Input
              id="address"
              type="text"
              placeholder="TRC20 address (T...)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1.5 font-mono text-sm"
              data-testid="input-address"
            />
          </div>

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
            <span className="text-muted-foreground">Max</span>
            <button
              type="button"
              onClick={setMax}
              className="text-primary hover:underline font-medium"
              data-testid="button-max-amount"
            >
              {formatMoney(maxWithdrawableMinor, "USDT")} USDT
            </button>
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
            <div>Network fee: {formatMoney(networkFeeMinor, "USDT")} USDT</div>
            <div>Minimum withdrawal: {formatMoney(minWithdrawalMinor, "USDT")} USDT</div>
          </div>

          <Button
            className="w-full"
            onClick={handleNext}
            disabled={!amount || amount === "0" || !address}
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
        fee={networkFeeMinor}
        details={[
          { label: "To Address", value: `${address.slice(0, 8)}...${address.slice(-6)}` },
          { label: "Network", value: "TRON (TRC20)" },
        ]}
        ctaLabel="Withdraw"
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
