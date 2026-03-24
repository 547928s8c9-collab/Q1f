import { AlertTriangle } from "lucide-react";

interface DemoModeBannerProps {
  isDemo: boolean;
}

export function DemoModeBanner({ isDemo }: DemoModeBannerProps) {
  if (!isDemo) return null;

  return (
    <div 
      className="flex items-center gap-2 rounded-md bg-warning/10 px-4 py-2 text-warning dark:bg-warning/20 dark:text-warning"
      data-testid="banner-demo-mode"
    >
      <AlertTriangle className="h-4 w-4" />
      <span className="text-sm font-medium">
        Демо-режим — изменения не затронут реальные данные
      </span>
    </div>
  );
}
