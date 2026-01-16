import { useState, createContext, useContext, useCallback } from "react";
import { Link } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@shared/schema";
import { CheckCircle2, XCircle, Clock, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionStep = "amount" | "confirm" | "result";
export type ActionStatus = "success" | "pending" | "failed";

interface ActionSheetContextValue {
  step: ActionStep;
  setStep: (step: ActionStep) => void;
  amount: string;
  setAmount: (amount: string) => void;
  status: ActionStatus;
  setStatus: (status: ActionStatus) => void;
  operationId: string | null;
  setOperationId: (id: string | null) => void;
  reset: () => void;
}

const ActionSheetContext = createContext<ActionSheetContextValue | null>(null);

export function useActionSheet() {
  const ctx = useContext(ActionSheetContext);
  if (!ctx) throw new Error("useActionSheet must be used within ActionSheet");
  return ctx;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ActionSheetProps) {
  const [step, setStep] = useState<ActionStep>("amount");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<ActionStatus>("success");
  const [operationId, setOperationId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("amount");
    setAmount("");
    setStatus("success");
    setOperationId(null);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTimeout(reset, 300);
    }
    onOpenChange(newOpen);
  };

  return (
    <ActionSheetContext.Provider
      value={{ step, setStep, amount, setAmount, status, setStatus, operationId, setOperationId, reset }}
    >
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle data-testid="sheet-title">{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <StepIndicator currentStep={step} />
          {children}
        </SheetContent>
      </Sheet>
    </ActionSheetContext.Provider>
  );
}

function StepIndicator({ currentStep }: { currentStep: ActionStep }) {
  const steps: ActionStep[] = ["amount", "confirm", "result"];
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-colors",
              index <= currentIndex ? "bg-primary" : "bg-muted"
            )}
          />
          {index < steps.length - 1 && (
            <div className={cn("w-8 h-0.5", index < currentIndex ? "bg-primary" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}

interface AmountInputProps {
  asset: "USDT" | "RUB";
  availableBalance: string;
  onNext: () => void;
  minAmount?: string;
  maxAmount?: string;
  label?: string;
  placeholder?: string;
}

export function AmountInput({
  asset,
  availableBalance,
  onNext,
  minAmount = "1000000",
  label = "Amount",
  placeholder = "0.00",
}: AmountInputProps) {
  const { amount, setAmount, step } = useActionSheet();
  const [error, setError] = useState("");

  if (step !== "amount") return null;

  const decimals = asset === "USDT" ? 6 : 2;
  const maxVal = BigInt(availableBalance);
  const minVal = BigInt(minAmount);

  const handleAmountChange = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, "");
    const parts = cleanValue.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > decimals) return;
    setAmount(cleanValue);
    setError("");
  };

  const toMinorUnits = (displayValue: string): string => {
    if (!displayValue || displayValue === ".") return "0";
    const parts = displayValue.split(".");
    const whole = parts[0] || "0";
    const fraction = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole + fraction).toString();
  };

  const handleNext = () => {
    const minorAmount = toMinorUnits(amount);
    if (BigInt(minorAmount) < minVal) {
      setError(`Minimum amount is ${formatMoney(minAmount, asset)}`);
      return;
    }
    if (BigInt(minorAmount) > maxVal) {
      setError("Insufficient balance");
      return;
    }
    onNext();
  };

  const setMax = () => {
    const divisor = BigInt(10 ** decimals);
    const whole = maxVal / divisor;
    const fraction = maxVal % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0");
    setAmount(`${whole}.${fractionStr}`);
    setError("");
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="amount">{label}</Label>
        <div className="relative mt-1.5">
          <Input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder={placeholder}
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="text-2xl font-semibold pr-20 tabular-nums"
            data-testid="input-amount"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-muted-foreground text-sm">{asset}</span>
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
          {formatMoney(availableBalance, asset)} {asset}
        </button>
      </div>

      <Button
        className="w-full"
        onClick={handleNext}
        disabled={!amount || amount === "0"}
        data-testid="button-next-step"
      >
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

interface ConfirmStepProps {
  asset: "USDT" | "RUB";
  balanceBefore: string;
  balanceAfter: string;
  fee?: string;
  details?: Array<{ label: string; value: string }>;
  ctaLabel: string;
  onConfirm: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export function ConfirmStep({
  asset,
  balanceBefore,
  balanceAfter,
  fee = "0",
  details = [],
  ctaLabel,
  onConfirm,
  onBack,
  isLoading = false,
}: ConfirmStepProps) {
  const { step, amount } = useActionSheet();

  if (step !== "confirm") return null;

  const decimals = asset === "USDT" ? 6 : 2;
  const toMinorUnits = (displayValue: string): string => {
    if (!displayValue || displayValue === ".") return "0";
    const parts = displayValue.split(".");
    const whole = parts[0] || "0";
    const fraction = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole + fraction).toString();
  };

  const minorAmount = toMinorUnits(amount);

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium tabular-nums">{formatMoney(minorAmount, asset)} {asset}</span>
        </div>
        {fee !== "0" && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Network Fee</span>
            <span className="font-medium tabular-nums text-warning">{formatMoney(fee, asset)} {asset}</span>
          </div>
        )}
        {details.map((detail, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{detail.label}</span>
            <span className="font-medium">{detail.value}</span>
          </div>
        ))}
        <div className="border-t pt-3 mt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Balance Before</span>
            <span className="tabular-nums">{formatMoney(balanceBefore, asset)} {asset}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Balance After</span>
            <span className="font-semibold tabular-nums text-primary">{formatMoney(balanceAfter, asset)} {asset}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1" data-testid="button-back">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onConfirm}
          className="flex-1"
          disabled={isLoading}
          data-testid="button-confirm"
        >
          {isLoading ? "Processing..." : ctaLabel}
        </Button>
      </div>
    </div>
  );
}

interface ResultStepProps {
  title: string;
  message: string;
  onClose: () => void;
}

export function ResultStep({ title, message, onClose }: ResultStepProps) {
  const { step, status, operationId } = useActionSheet();

  if (step !== "result") return null;

  const statusConfig = {
    success: {
      icon: CheckCircle2,
      iconClass: "text-positive",
      bgClass: "bg-positive/10",
    },
    pending: {
      icon: Clock,
      iconClass: "text-warning",
      bgClass: "bg-warning/10",
    },
    failed: {
      icon: XCircle,
      iconClass: "text-destructive",
      bgClass: "bg-destructive/10",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="text-center space-y-4">
      <div className={cn("w-16 h-16 rounded-full mx-auto flex items-center justify-center", config.bgClass)}>
        <Icon className={cn("w-8 h-8", config.iconClass)} />
      </div>
      <div>
        <h3 className="text-lg font-semibold" data-testid="result-title">{title}</h3>
        <p className="text-muted-foreground text-sm mt-1">{message}</p>
      </div>
      
      {operationId && (
        <Link href="/activity">
          <Button variant="outline" className="w-full" data-testid="button-view-activity">
            View in Activity
          </Button>
        </Link>
      )}
      
      <Button onClick={onClose} className="w-full" data-testid="button-close-sheet">
        Done
      </Button>
    </div>
  );
}
