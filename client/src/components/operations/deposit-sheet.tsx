import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { createIdempotencyKey } from "@/lib/idempotency";
import { formatMoney, type BootstrapResponse } from "@shared/schema";
import {
  ActionSheet,
  AmountInput,
  ConfirmStep,
  ResultStep,
  useActionSheet,
} from "./action-sheet";

interface DepositSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrap: BootstrapResponse | undefined;
}

export function DepositSheet({ open, onOpenChange, bootstrap }: DepositSheetProps) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Deposit USDT"
      description="Add funds to your wallet"
    >
      <DepositFlow bootstrap={bootstrap} onClose={() => onOpenChange(false)} />
    </ActionSheet>
  );
}

function DepositFlow({
  bootstrap,
  onClose,
}: {
  bootstrap: BootstrapResponse | undefined;
  onClose: () => void;
}) {
  const { step, setStep, amount, setStatus, setOperationId } = useActionSheet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const availableBalance = bootstrap?.balances.USDT.available || "0";

  const toMinorUnits = (displayValue: string): string => {
    if (!displayValue || displayValue === ".") return "0";
    const parts = displayValue.split(".");
    const whole = parts[0] || "0";
    const fraction = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    return BigInt(whole + fraction).toString();
  };

  const minorAmount = toMinorUnits(amount);
  const balanceAfter = (BigInt(availableBalance) + BigInt(minorAmount || "0")).toString();

  const depositMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/deposit/usdt/simulate",
        { amount: minorAmount },
        { headers: { "Idempotency-Key": createIdempotencyKey("dep_usdt") } },
      );
      return res.json();
    },
    onSuccess: (data) => {
      setStatus("success");
      setOperationId(data.operation?.id || null);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({
        title: "Deposit successful",
        description: `${formatMoney(minorAmount, "USDT")} USDT added to your wallet`,
      });
    },
    onError: (error: Error) => {
      setStatus("failed");
      setStep("result");
      toast({
        title: "Deposit failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const statusMessages = {
    success: {
      title: "Deposit Complete",
      message: `${formatMoney(minorAmount, "USDT")} USDT has been added to your wallet.`,
    },
    pending: {
      title: "Deposit Processing",
      message: "Your deposit is being processed. This may take a few minutes.",
    },
    failed: {
      title: "Deposit Failed",
      message: "Something went wrong. Please try again.",
    },
  };

  const { step: currentStep } = useActionSheet();
  const statusKey = currentStep === "result" ? (depositMutation.isError ? "failed" : "success") : "success";

  return (
    <>
      <AmountInput
        asset="USDT"
        availableBalance="999999999999999"
        onNext={() => setStep("confirm")}
        minAmount="1000000"
        label="Deposit Amount"
        placeholder="100.00"
      />

      <ConfirmStep
        asset="USDT"
        balanceBefore={availableBalance}
        balanceAfter={balanceAfter}
        fee="0"
        details={[{ label: "Method", value: "Simulated Deposit" }]}
        ctaLabel="Deposit"
        onConfirm={() => depositMutation.mutate()}
        onBack={() => setStep("amount")}
        isLoading={depositMutation.isPending}
      />

      <ResultStep
        title={statusMessages[statusKey].title}
        message={statusMessages[statusKey].message}
        onClose={onClose}
      />
    </>
  );
}
