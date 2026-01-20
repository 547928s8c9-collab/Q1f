import React, { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 flex-wrap", className)}>
      <div className="space-y-0.5">
        <h2 className="text-lg font-semibold tracking-tight" data-testid="text-section-title">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground" data-testid="text-section-subtitle">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
