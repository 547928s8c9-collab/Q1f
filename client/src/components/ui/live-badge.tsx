import { cn } from "@/lib/utils";

type LiveBadgeStatus = "connected" | "delayed" | "disconnected";

interface LiveBadgeProps {
  className?: string;
  pulse?: boolean;
  status?: LiveBadgeStatus;
}

const statusConfig: Record<LiveBadgeStatus, { dot: string; wrapper: string; label: string }> = {
  connected: {
    dot: "bg-green-500",
    wrapper: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    label: "Live",
  },
  delayed: {
    dot: "bg-warning",
    wrapper: "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning",
    label: "Задержка",
  },
  disconnected: {
    dot: "bg-gray-400",
    wrapper: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
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
