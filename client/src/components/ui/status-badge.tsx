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
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", config.className)}
      data-testid={`status-badge-${status}`}
    >
      <span className={cn(
        "w-1.5 h-1.5 rounded-full mr-1.5",
        status === "processing" && "animate-pulse",
        status === "pending" && "bg-warning",
        status === "processing" && "bg-blue-500",
        status === "completed" && "bg-positive",
        status === "active" && "bg-positive",
        status === "failed" && "bg-negative",
        status === "cancelled" && "bg-muted-foreground"
      )} />
      {config.label}
    </Badge>
  );
}
