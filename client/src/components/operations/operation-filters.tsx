import { cn } from "@/lib/utils";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  RefreshCw,
  Percent,
  type LucideIcon
} from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

const filterOptions: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "DEPOSIT_USDT,DEPOSIT_CARD,DAILY_PAYOUT,PROFIT_PAYOUT,PRINCIPAL_REDEEM_EXECUTED", label: "In", icon: ArrowDownLeft },
  { value: "WITHDRAW_USDT,INVEST,SUBSCRIPTION", label: "Out", icon: ArrowUpRight },
  { value: "INVEST,PROFIT_ACCRUAL,PROFIT_PAYOUT,PRINCIPAL_REDEEM_EXECUTED", label: "Invest", icon: TrendingUp },
  { value: "VAULT_TRANSFER", label: "Transfers", icon: RefreshCw },
  { value: "SUBSCRIPTION,FX", label: "Fees", icon: Percent },
];

interface OperationFiltersProps {
  value: string;
  onChange: (value: string) => void;
}

export function OperationFilters({ value, onChange }: OperationFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {filterOptions.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors inline-flex items-center gap-1.5",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground hover-elevate"
            )}
            data-testid={`filter-${option.label.toLowerCase()}`}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
