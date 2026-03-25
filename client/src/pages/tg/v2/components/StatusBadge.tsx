import { cn } from "@/lib/utils";

const STATE_LABELS: Record<string, string> = {
  ACTIVE: "Активна",
  RUNNING: "Работает",
  PAUSED: "На паузе",
  NOT_INVESTED: "Не инвестирована",
  STOPPED: "Остановлена",
};

export function StatusBadge({ state }: { state: string }) {
  const label = STATE_LABELS[state] ?? state.toLowerCase().replace(/_/g, " ");
  const tone = state === "ACTIVE" || state === "RUNNING" ? "text-positive" : state === "PAUSED" ? "text-warning" : "text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>
      {label}
    </span>
  );
}
