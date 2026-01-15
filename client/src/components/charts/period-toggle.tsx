import { cn } from "@/lib/utils";

type Period = 7 | 30 | 90;

interface PeriodToggleProps {
  value: Period;
  onChange: (value: Period) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  const periods: Period[] = [7, 30, 90];

  return (
    <div className="inline-flex items-center bg-muted rounded-lg p-1 gap-1">
      {periods.map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            value === period
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover-elevate"
          )}
          data-testid={`period-toggle-${period}`}
        >
          {period}D
        </button>
      ))}
    </div>
  );
}
