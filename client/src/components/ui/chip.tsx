import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type ChipVariant = "default" | "success" | "warning" | "danger" | "primary" | "outline";
type ChipSize = "sm" | "md";

interface ChipProps {
  children: ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  icon?: ReactNode;
  className?: string;
}

const variantClasses: Record<ChipVariant, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  primary: "bg-primary/10 text-primary",
  outline: "border border-border bg-transparent text-foreground",
};

const sizeClasses: Record<ChipSize, string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function Chip({ 
  children, 
  variant = "default", 
  size = "sm",
  icon,
  className 
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      data-testid="chip"
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
