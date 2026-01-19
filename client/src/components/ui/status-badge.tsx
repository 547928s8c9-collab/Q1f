import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending_activation: {
    label: "Pending activation",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse",
  },
  completed: {
    label: "Completed",
    className: "bg-positive/10 text-positive border-positive/20",
  },
  failed: {
    label: "Failed",
    className: "bg-negative/10 text-negative border-negative/20",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground border-muted",
  },
  active: {
    label: "Active",
    className: "bg-positive/10 text-positive border-positive/20",
  },
  disabled: {
    label: "Disabled",
    className: "bg-muted text-muted-foreground border-muted",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  const config = statusConfig[status] || statusConfig[normalizedStatus] || {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", config.className)}
      data-testid={`status-badge-${normalizedStatus}`}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full mr-1.5",
        normalizedStatus === "processing" && "animate-pulse",
        normalizedStatus === "pending" && "bg-warning",
        normalizedStatus === "pending_activation" && "bg-warning",
        normalizedStatus === "processing" && "bg-blue-500",
        normalizedStatus === "completed" && "bg-positive",
        normalizedStatus === "active" && "bg-positive",
        normalizedStatus === "failed" && "bg-negative",
        normalizedStatus === "cancelled" && "bg-muted-foreground",
        normalizedStatus === "disabled" && "bg-muted-foreground"
      )} />
      {config.label}
    </Badge>
  );
}
