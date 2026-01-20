import { AlertTriangle } from "lucide-react";

interface DemoModeBannerProps {
  isDemo: boolean;
}

export function DemoModeBanner({ isDemo }: DemoModeBannerProps) {
  if (!isDemo) return null;

  return (
    <div 
      className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      data-testid="banner-demo-mode"
    >
      <AlertTriangle className="h-4 w-4" />
      <span className="text-sm font-medium">
        Demo Mode - Changes will not affect real data
      </span>
    </div>
  );
}
