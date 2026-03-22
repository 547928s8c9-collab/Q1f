import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import {
  TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine,
  RefreshCw, Wallet, Receipt, BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── types ──────────────────────────────────────────────────────────

type ManagementEventType =
  | "daily_pnl" | "deposit" | "withdrawal"
  | "strategy_change" | "settlement" | "fee_charged";

const EVENT_LABELS: Record<ManagementEventType, string> = {
  daily_pnl:       "Начислен дневной доход",
  deposit:         "Пополнение зачислено",
  withdrawal:      "Вывод выполнен",
  strategy_change: "Стратегия изменена",
  settlement:      "Расчёт по портфелю",
  fee_charged:     "Комиссия управляющего",
};

const MANAGEMENT_TYPES = new Set<string>(Object.keys(EVENT_LABELS));

interface EventData {
  id: string;
  type: string;
  message: string;
  strategyId: string | null;
  createdAt: string | null;
  payloadJson: unknown;
}

// ── helpers ────────────────────────────────────────────────────────

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatRuDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}, ${d.getFullYear()}`;
}

const EVENT_ICONS: Partial<Record<string, typeof BarChart2>> = {
  deposit:         ArrowDownToLine,
  withdrawal:      ArrowUpFromLine,
  strategy_change: RefreshCw,
  settlement:      Wallet,
  fee_charged:     Receipt,
};

// ── row components ─────────────────────────────────────────────────

function DailyPnlRow({ event }: { event: EventData }) {
  const p = (event.payloadJson ?? {}) as { amount?: number; tier?: string };
  const amount   = p.amount ?? 0;
  const positive = amount >= 0;
  const Icon     = positive ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className={cn(
        "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0",
        positive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{EVENT_LABELS.daily_pnl}</p>
          <span className={cn(
            "text-sm font-semibold tabular-nums",
            positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
          )}>
            {positive ? "+" : "−"}{Math.abs(amount).toFixed(2)} USDT
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          {p.tier && <p className="text-xs text-muted-foreground">{p.tier}</p>}
          {event.createdAt && (
            <p className="text-xs text-muted-foreground ml-auto">{formatRuDate(event.createdAt)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ManagementEventRow({ event }: { event: EventData }) {
  const label = EVENT_LABELS[event.type as ManagementEventType] ?? event.type;
  const Icon  = EVENT_ICONS[event.type] ?? BarChart2;

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {event.message && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">{event.message}</p>
        )}
        {event.createdAt && (
          <p className="text-xs text-muted-foreground mt-0.5">{formatRuDate(event.createdAt)}</p>
        )}
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────

export default function ActivityEvents() {
  const { data, isLoading } = useQuery<{ events: EventData[] }>({
    queryKey: ["/api/activity"],
    queryFn: async () => {
      const res = await fetch("/api/activity", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
  });

  const events = (data?.events ?? []).filter((e) => MANAGEMENT_TYPES.has(e.type));

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto pb-24">
        <h1 className="text-2xl font-bold mb-6">Активность</h1>
        <Card className="p-5">
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto pb-24" data-testid="activity-events-page">
      <h1 className="text-2xl font-bold mb-6">Активность</h1>

      {events.length === 0 ? (
        <Card>
          <div
            className="flex flex-col items-center justify-center text-center py-12 px-6"
            data-testid="empty-state"
          >
            <div className="text-4xl mb-4"><BarChart2 className="w-10 h-10 text-muted-foreground mx-auto" /></div>
            <h3 className="text-lg font-medium mb-1" data-testid="text-empty-title">
              Активность появится после первого расчётного дня
            </h3>
            <p className="text-sm text-muted-foreground" data-testid="text-empty-description">
              Результаты управления публикуются ежедневно
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="divide-y divide-border">
            {events.map((event) =>
              event.type === "daily_pnl"
                ? <DailyPnlRow key={event.id} event={event} />
                : <ManagementEventRow key={event.id} event={event} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
