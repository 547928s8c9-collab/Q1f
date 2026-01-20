import React from "react";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, backHref, action }: PageHeaderProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {backHref && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation(backHref)}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
