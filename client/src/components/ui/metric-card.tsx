import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  prefix?: string;
  suffix?: string;
  trend?: "positive" | "negative" | "neutral";
}

export function MetricCard({ label, value, change, prefix, suffix, trend = "neutral" }: MetricCardProps) {
  return (
    <Card className="p-4" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {change && (
        <span
          className={cn(
            "text-xs font-medium tabular-nums mt-1 inline-block",
            trend === "positive" && "text-positive",
            trend === "negative" && "text-negative",
            trend === "neutral" && "text-muted-foreground"
          )}
        >
          {change}
        </span>
      )}
    </Card>
  );
}
