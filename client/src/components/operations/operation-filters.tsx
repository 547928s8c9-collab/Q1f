import { cn } from "@/lib/utils";

const filterOptions = [
  { value: "all", label: "All" },
  { value: "DEPOSIT_USDT,DEPOSIT_CARD", label: "Deposits" },
  { value: "WITHDRAW_USDT", label: "Withdrawals" },
  { value: "INVEST", label: "Invest" },
  { value: "DAILY_PAYOUT,PROFIT_ACCRUAL,PROFIT_PAYOUT", label: "Payouts" },
  { value: "PRINCIPAL_REDEEM_EXECUTED", label: "Redemptions" },
  { value: "FX", label: "FX" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "KYC", label: "KYC" },
];

interface OperationFiltersProps {
  value: string;
  onChange: (value: string) => void;
}

export function OperationFilters({ value, onChange }: OperationFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {filterOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground hover-elevate"
          )}
          data-testid={`filter-${option.label.toLowerCase()}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
