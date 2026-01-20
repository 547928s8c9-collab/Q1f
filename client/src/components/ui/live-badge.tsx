import { cn } from "@/lib/utils";

interface LiveBadgeProps {
  className?: string;
  pulse?: boolean;
}

export function LiveBadge({ className, pulse = true }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-green-500",
          pulse && "animate-pulse"
        )}
      />
      LIVE
    </span>
  );
}
