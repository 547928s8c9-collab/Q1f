import { Link } from "wouter";
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
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, getOperationCopy, type Operation } from "@shared/schema";

interface OperationRowProps {
  operation: Operation;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
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
  DEPOSIT_USDT: "bg-positive/10 text-positive",
  DEPOSIT_CARD: "bg-positive/10 text-positive",
  WITHDRAW_USDT: "bg-negative/10 text-negative",
  INVEST: "bg-primary/10 text-primary",
  DAILY_PAYOUT: "bg-positive/10 text-positive",
  PROFIT_ACCRUAL: "bg-positive/10 text-positive",
  PROFIT_PAYOUT: "bg-positive/10 text-positive",
  PRINCIPAL_REDEEM_EXECUTED: "bg-positive/10 text-positive",
  PAYOUT_SETTINGS_CHANGED: "bg-blue-500/10 text-blue-500",
  FX: "bg-blue-500/10 text-blue-500",
  SUBSCRIPTION: "bg-muted text-muted-foreground",
  KYC: "bg-blue-500/10 text-blue-500",
  VAULT_TRANSFER: "bg-muted text-muted-foreground",
};

export function OperationRow({ operation }: OperationRowProps) {
  const Icon = iconMap[operation.type] || Wallet;
  const iconColor = iconColorMap[operation.type] || "bg-muted text-muted-foreground";
  const copy = getOperationCopy(operation.type, operation.status, { strategyName: operation.strategyName });

  const isCredit = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT", "PRINCIPAL_REDEEM_EXECUTED"].includes(operation.type);
  const isDebit = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"].includes(operation.type);

  const formattedDate = operation.createdAt
    ? new Date(operation.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <Link href={`/activity/${operation.id}`}>
      <div
        className="flex items-center gap-4 p-4 rounded-lg hover-elevate cursor-pointer transition-colors border border-transparent hover:border-border"
        data-testid={`operation-row-${operation.id}`}
      >
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0", iconColor)}>
          <Icon className="w-[18px] h-[18px]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{copy.title}</p>
          <p className="text-xs text-muted-foreground truncate">{copy.subtitle}</p>
        </div>

        <div className="text-right flex-shrink-0">
          {operation.amount && operation.asset && (
            <p
              className={cn(
                "text-sm font-medium tabular-nums",
                isCredit && operation.status === "completed" && "text-positive",
                isDebit && operation.status === "completed" && "text-negative",
                operation.status !== "completed" && "text-muted-foreground"
              )}
            >
              {isCredit ? "+" : isDebit ? "-" : ""}
              {formatMoney(operation.amount, operation.asset)} {operation.asset}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{formattedDate}</p>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}
