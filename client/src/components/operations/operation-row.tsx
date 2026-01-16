import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  RefreshCw, 
  CreditCard, 
  Shield, 
  Wallet,
  ChevronRight,
  PiggyBank,
  Banknote,
  Settings,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";
import { Chip } from "@/components/ui/chip";
import { getOperationCopy, type Operation } from "@shared/schema";

interface OperationRowProps {
  operation: Operation;
  onClick?: () => void;
}

const iconMap: Record<string, LucideIcon> = {
  DEPOSIT_USDT: ArrowDownLeft,
  DEPOSIT_CARD: CreditCard,
  WITHDRAW_USDT: ArrowUpRight,
  INVEST: TrendingUp,
  DAILY_PAYOUT: TrendingUp,
  PROFIT_ACCRUAL: PiggyBank,
  PROFIT_PAYOUT: Banknote,
  PRINCIPAL_REDEEM_EXECUTED: ArrowDownLeft,
  PAYOUT_SETTINGS_CHANGED: Settings,
  FX: RefreshCw,
  SUBSCRIPTION: CreditCard,
  KYC: Shield,
  VAULT_TRANSFER: Wallet,
};

const iconColorMap: Record<string, string> = {
  DEPOSIT_USDT: "bg-success/10 text-success",
  DEPOSIT_CARD: "bg-success/10 text-success",
  WITHDRAW_USDT: "bg-danger/10 text-danger",
  INVEST: "bg-primary/10 text-primary",
  DAILY_PAYOUT: "bg-success/10 text-success",
  PROFIT_ACCRUAL: "bg-success/10 text-success",
  PROFIT_PAYOUT: "bg-success/10 text-success",
  PRINCIPAL_REDEEM_EXECUTED: "bg-success/10 text-success",
  PAYOUT_SETTINGS_CHANGED: "bg-primary/10 text-primary",
  FX: "bg-primary/10 text-primary",
  SUBSCRIPTION: "bg-muted text-muted-foreground",
  KYC: "bg-primary/10 text-primary",
  VAULT_TRANSFER: "bg-muted text-muted-foreground",
};

const statusChipVariant: Record<string, "default" | "success" | "warning" | "danger"> = {
  pending: "warning",
  processing: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "default",
};

export function OperationRow({ operation, onClick }: OperationRowProps) {
  const Icon = iconMap[operation.type] || Wallet;
  const iconColor = iconColorMap[operation.type] || "bg-muted text-muted-foreground";
  const copy = getOperationCopy(operation.type, operation.status, { strategyName: operation.strategyName });

  const isCredit = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT", "PRINCIPAL_REDEEM_EXECUTED"].includes(operation.type);
  const isDebit = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"].includes(operation.type);

  const amount = operation.amount ? parseFloat(operation.amount) / 1000000 : 0;
  const showAmount = operation.amount && operation.asset && amount !== 0;

  const formattedTime = operation.createdAt
    ? new Date(operation.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-4 hover-elevate cursor-pointer transition-colors"
      data-testid={`operation-row-${operation.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${copy.title}, ${operation.status}`}
    >
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", iconColor)}>
        <Icon className="w-[18px] h-[18px]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{copy.title}</p>
          <Chip variant={statusChipVariant[operation.status] || "default"} size="sm">
            {operation.status.charAt(0).toUpperCase() + operation.status.slice(1)}
          </Chip>
        </div>
        <p className="text-xs text-muted-foreground truncate">{copy.subtitle}</p>
      </div>

      <div className="text-right flex-shrink-0">
        {showAmount && (
          <Money
            value={isDebit ? -amount : amount}
            currency={operation.asset!}
            size="sm"
            showSign
            showCurrency
            variant={
              operation.status !== "completed" 
                ? "muted" 
                : isCredit 
                  ? "positive" 
                  : isDebit 
                    ? "negative" 
                    : "default"
            }
          />
        )}
        <p className="text-xs text-muted-foreground">{formattedTime}</p>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </div>
  );
}
