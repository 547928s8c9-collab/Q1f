import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  children,
  className 
}: EmptyStateProps) {
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className
      )}
      data-testid="empty-state"
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-medium mb-1" data-testid="text-empty-title">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-4" data-testid="text-empty-description">
          {description}
        </p>
      )}
      {action && (
        <Button 
          onClick={action.onClick}
          data-testid="button-empty-action"
        >
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
