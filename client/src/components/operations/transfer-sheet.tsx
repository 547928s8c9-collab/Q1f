import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { createIdempotencyKey } from "@/lib/idempotency";
import { apiRequest } from "@/lib/queryClient";
import { updateBootstrapAfterTransfer } from "@/lib/vaults";
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
import { ArrowRight, ArrowDown } from "lucide-react";
import {
  ActionSheet,
  ConfirmStep,
  ResultStep,
  useActionSheet,
} from "./action-sheet";

interface TransferSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrap: BootstrapResponse | undefined;
}

type VaultType = "wallet" | "principal" | "profit" | "taxes";

const VAULT_LABELS: Record<VaultType, string> = {
  wallet: "Wallet",
  principal: "Principal Vault",
  profit: "Profit Vault",
  taxes: "Taxes Vault",
};

export function TransferSheet({ open, onOpenChange, bootstrap }: TransferSheetProps) {
  return (
    <ActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Transfer"
      description="Move funds between wallet and vaults"
    >
      <TransferFlow bootstrap={bootstrap} onClose={() => onOpenChange(false)} />
    </ActionSheet>
  );
}

function TransferFlow({
  bootstrap,
  onClose,
}: {
  bootstrap: BootstrapResponse | undefined;
  onClose: () => void;
}) {
  const { step, setStep, amount, setAmount, setStatus, setOperationId } = useActionSheet();
  const [fromVault, setFromVault] = useState<VaultType>("wallet");
  const [toVault, setToVault] = useState<VaultType>("principal");
  const [error, setError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getBalance = (vault: VaultType): string => {
    if (!bootstrap) return "0";
    if (vault === "wallet") return bootstrap.balances.USDT.available;
    return bootstrap.vaults[vault]?.balance || "0";
  };

  const sourceBalance = getBalance(fromVault);
  const destBalance = getBalance(toVault);

  const toMinorUnits = (displayValue: string): string => {
    if (!displayValue || displayValue === ".") return "0";
    const parts = displayValue.split(".");
    const whole = parts[0] || "0";
    const fraction = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    return BigInt(whole + fraction).toString();
  };

  const minorAmount = toMinorUnits(amount);
  const sourceAfter = (BigInt(sourceBalance) - BigInt(minorAmount || "0")).toString();
  const destAfter = (BigInt(destBalance) + BigInt(minorAmount || "0")).toString();

  const handleAmountChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, "");
    const parts = cleanValue.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 6) return;
    setAmount(cleanValue);
    setError("");
  };

  const swapVaults = () => {
    const temp = fromVault;
    setFromVault(toVault);
    setToVault(temp);
    setAmount("");
    setError("");
  };

  const handleNext = () => {
    const minVal = BigInt("1000000");
    const maxVal = BigInt(sourceBalance);
    
    if (fromVault === toVault) {
      setError("Source and destination must be different");
      return;
    }
    if (BigInt(minorAmount) < minVal) {
      setError("Minimum transfer is 1 USDT");
      return;
    }
    if (BigInt(minorAmount) > maxVal) {
      setError("Insufficient balance");
      return;
    }
    setStep("confirm");
  };

  const setMax = () => {
    const maxMinor = BigInt(sourceBalance);
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

  const transferMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vault/transfer", {
        fromVault,
        toVault,
        amount: minorAmount,
      }, { headers: { "Idempotency-Key": createIdempotencyKey("vault_transfer") } });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || "Transfer failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setStatus("success");
      setOperationId(data.operation?.id || null);
      setStep("result");
      queryClient.setQueryData<BootstrapResponse>(["/api/bootstrap"], (current) => {
        if (!current) return current;
        return updateBootstrapAfterTransfer(current, { fromVault, toVault, amount: minorAmount });
      });
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Transfer complete",
        description: `${formatMoney(minorAmount, "USDT")} USDT transferred`,
      });
    },
    onError: (error: Error) => {
      setStatus("failed");
      setStep("result");
      toast({
        title: "Transfer failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { step: currentStep } = useActionSheet();
  const statusKey = currentStep === "result" 
    ? (transferMutation.isError ? "failed" : "success") 
    : "success";

  const statusMessages = {
    success: {
      title: "Transfer Complete",
      message: `${formatMoney(minorAmount, "USDT")} USDT moved from ${VAULT_LABELS[fromVault]} to ${VAULT_LABELS[toVault]}.`,
    },
    pending: {
      title: "Transfer Processing",
      message: "Your transfer is being processed.",
    },
    failed: {
      title: "Transfer Failed",
      message: transferMutation.error?.message || "Something went wrong. Please try again.",
    },
  };

  const availableFromOptions = (["wallet", "principal", "profit", "taxes"] as VaultType[]).filter(
    (v) => v !== toVault
  );
  const availableToOptions = (["wallet", "principal", "profit", "taxes"] as VaultType[]).filter(
    (v) => v !== fromVault
  );

  return (
    <>
      {step === "amount" && (
        <div className="space-y-4">
          <div>
            <Label>From</Label>
            <Select value={fromVault} onValueChange={(v) => setFromVault(v as VaultType)}>
              <SelectTrigger className="mt-1.5" data-testid="select-from-vault">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFromOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {VAULT_LABELS[v]} ({formatMoney(getBalance(v), "USDT")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={swapVaults}
              data-testid="button-swap-vaults"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <Label>To</Label>
            <Select value={toVault} onValueChange={(v) => setToVault(v as VaultType)}>
              <SelectTrigger className="mt-1.5" data-testid="select-to-vault">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableToOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {VAULT_LABELS[v]} ({formatMoney(getBalance(v), "USDT")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <span className="text-muted-foreground">Available in {VAULT_LABELS[fromVault]}</span>
            <button
              type="button"
              onClick={setMax}
              className="text-primary hover:underline font-medium"
              data-testid="button-max-amount"
            >
              {formatMoney(sourceBalance, "USDT")} USDT
            </button>
          </div>

          <Button
            className="w-full"
            onClick={handleNext}
            disabled={!amount || amount === "0" || fromVault === toVault}
            data-testid="button-next-step"
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      <ConfirmStep
        asset="USDT"
        balanceBefore={sourceBalance}
        balanceAfter={sourceAfter}
        fee="0"
        details={[
          { label: "From", value: VAULT_LABELS[fromVault] },
          { label: "To", value: VAULT_LABELS[toVault] },
          { label: "Destination After", value: `${formatMoney(destAfter, "USDT")} USDT` },
        ]}
        ctaLabel="Transfer"
        onConfirm={() => transferMutation.mutate()}
        onBack={() => setStep("amount")}
        isLoading={transferMutation.isPending}
      />

      <ResultStep
        title={statusMessages[statusKey].title}
        message={statusMessages[statusKey].message}
        onClose={onClose}
      />
    </>
  );
}
