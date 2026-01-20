import { cn } from "@/lib/utils";

const STATE_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  RUNNING: "Running",
  PAUSED: "Paused",
  NOT_INVESTED: "Not invested",
  STOPPED: "Stopped",
};

export function StatusBadge({ state }: { state: string }) {
  const label = STATE_LABELS[state] ?? state.toLowerCase().replace(/_/g, " ");
  const tone = state === "ACTIVE" || state === "RUNNING" ? "text-emerald-500" : state === "PAUSED" ? "text-amber-500" : "text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>
      {label}
    </span>
  );
}
