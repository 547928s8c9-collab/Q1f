import { cn } from "@/lib/utils";

export type TgTabKey = "overview" | "strategies" | "activity";

interface BottomNavProps {
  active: TgTabKey;
  onChange: (tab: TgTabKey) => void;
}

const tabs: Array<{ key: TgTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "strategies", label: "Strategies" },
  { key: "activity", label: "Activity" },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-around px-3 py-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex min-w-[80px] flex-col items-center justify-center rounded-xl px-3 py-2 text-xs font-medium transition",
              active === tab.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
