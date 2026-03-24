import { cn } from "@/lib/utils";

type LiveBadgeStatus = "connected" | "delayed" | "disconnected";

interface LiveBadgeProps {
  className?: string;
  pulse?: boolean;
  status?: LiveBadgeStatus;
}

const statusConfig: Record<LiveBadgeStatus, { dot: string; wrapper: string; label: string }> = {
  connected: {
    dot: "bg-positive",
    wrapper: "bg-positive/10 text-positive",
    label: "Live",
  },
  delayed: {
    dot: "bg-warning",
    wrapper: "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning",
    label: "Задержка",
  },
  disconnected: {
    dot: "bg-muted-foreground",
    wrapper: "bg-muted text-muted-foreground",
    label: "Офлайн",
  },
};

export function LiveBadge({ className, pulse = true, status = "connected" }: LiveBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        config.wrapper,
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          config.dot,
          pulse && "animate-pulse"
        )}
      />
      {config.label}
    </span>
  );
}
