import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "@/components/charts/sparkline";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Activity, Play, Pause, Square, Clock, TrendingUp, 
  TrendingDown, Wifi, WifiOff, RefreshCw, Loader2,
  ArrowUpRight, ArrowDownRight, CircleDot
} from "lucide-react";
import { format } from "date-fns";

interface SimSession {
  id: string;
  profileSlug: string;
  status: "created" | "running" | "paused" | "stopped" | "finished" | "failed";
  config: Record<string, unknown>;
  startMs: number;
  endMs: number;
  speed: number;
  lastSeq: number;
  progress?: {
    candleIndex: number;
    totalCandles: number;
    pct: number;
  };
  streamUrl: string;
  createdAt: string;
}

interface SimEvent {
  seq: number;
  type: "candle" | "trade" | "equity" | "status" | "error";
  ts: number;
  payload: Record<string, unknown>;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

const statusConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger" | "default"; label: string }> = {
  created: { color: "text-muted-foreground", chipVariant: "default", label: "Created" },
  running: { color: "text-positive", chipVariant: "success", label: "Running" },
  paused: { color: "text-warning", chipVariant: "warning", label: "Paused" },
  stopped: { color: "text-muted-foreground", chipVariant: "default", label: "Stopped" },
  finished: { color: "text-positive", chipVariant: "success", label: "Finished" },
  failed: { color: "text-negative", chipVariant: "danger", label: "Failed" },
};

const normalizePayload = (payload: Record<string, unknown>) => {
  if (payload && "data" in payload && "type" in payload) {
    return (payload as { data: Record<string, unknown> }).data;
  }
  return payload;
};

function EventFeed({ events }: { events: SimEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events.length]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case "trade":
        return <ArrowUpRight className="w-3.5 h-3.5" />;
      case "equity":
        return <TrendingUp className="w-3.5 h-3.5" />;
      case "status":
        return <CircleDot className="w-3.5 h-3.5" />;
      case "candle":
        return <Activity className="w-3.5 h-3.5" />;
      default:
        return <Activity className="w-3.5 h-3.5" />;
    }
  };

  const getEventColor = (type: string, payload: Record<string, unknown>) => {
    if (type === "trade") {
      return payload.side === "buy" ? "text-positive" : "text-negative";
    }
    if (type === "equity") {
      const drawdown = payload.drawdownPct as number | undefined;
      if (typeof drawdown === "number") {
        return drawdown > 0 ? "text-negative" : "text-positive";
      }
    }
    return "text-muted-foreground";
  };

  const formatPayload = (type: string, payload: Record<string, unknown>) => {
    if (type === "trade") {
      const side = payload.side as string;
      const price = payload.price as number;
      const qty = payload.qty as number;
      if (side && qty && price) {
        return `${side?.toUpperCase()} ${qty} @ ${price?.toFixed(2)}`;
      }
      const entry = payload.entryPrice as number;
      const exit = payload.exitPrice as number;
      if (entry && exit) {
        return `Entry ${entry.toFixed(2)} → Exit ${exit.toFixed(2)}`;
      }
    }
    if (type === "equity") {
      const value = (payload.equity as number) ?? (payload.value as number);
      const drawdown = payload.drawdownPct as number | undefined;
      if (typeof drawdown === "number") {
        return `$${value?.toFixed(2)} (DD ${drawdown.toFixed(2)}%)`;
      }
      return `$${value?.toFixed(2)}`;
    }
    if (type === "candle") {
      const candle = payload.candle as { close?: number } | undefined;
      const close = (payload.close as number | undefined) ?? candle?.close;
      return `Close: ${close?.toFixed(2)}`;
    }
    if (type === "status") {
      return payload.status as string;
    }
    return JSON.stringify(payload).slice(0, 50);
  };

  return (
    <div
      ref={feedRef}
      className="h-64 overflow-y-auto space-y-1 scrollbar-thin"
      data-testid="event-feed"
    >
      {events.length === 0 ? (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          Waiting for events...
        </div>
      ) : (
        events.slice(-50).map((event) => {
          const normalizedPayload = normalizePayload(event.payload);
          return (
          <div
            key={event.seq}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-sm"
            data-testid={`event-${event.seq}`}
          >
            <span className={getEventColor(event.type, normalizedPayload)}>
              {getEventIcon(event.type)}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {format(new Date(event.ts), "HH:mm:ss")}
            </span>
            <span className="text-xs font-medium uppercase text-muted-foreground w-12">
              {event.type}
            </span>
            <span className={`flex-1 truncate ${getEventColor(event.type, normalizedPayload)}`}>
              {formatPayload(event.type, normalizedPayload)}
            </span>
          </div>
        );
        })
      )}
    </div>
  );
}

export default function LiveSessionView() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [equityHistory, setEquityHistory] = useState<Array<{ value: number }>>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [currentCandle, setCurrentCandle] = useState<{ ts: number; close: number } | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: session, isLoading, error, refetch } = useQuery<SimSession>({
    queryKey: ["/api/sim/sessions", id],
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      const isTerminal = data?.status === "stopped" || data?.status === "finished" || data?.status === "failed";
      if (isTerminal) {
        return false;
      }
      return 3000;
    },
  });

  useSetPageTitle(session ? `Session ${session.profileSlug}` : "Live Session");

  const connectSSE = useCallback(() => {
    if (!id || !session) return;
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    const url = `/api/sim/sessions/${id}/stream?fromSeq=${lastSeqRef.current}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnectionStatus("connected");
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        
        if (data.type === "heartbeat") return;
        
        const event = data as SimEvent;
        lastSeqRef.current = event.seq;
        
        setEvents((prev) => [...prev.slice(-200), event]);

        if (event.type === "candle") {
          const normalizedPayload = normalizePayload(event.payload);
          const candle = (normalizedPayload.candle as { ts?: number; close?: number } | undefined) ?? normalizedPayload;
          setCurrentCandle({
            ts: (candle.ts ?? event.ts) as number,
            close: (candle.close ?? normalizedPayload.close) as number,
          });
        }

        if (event.type === "equity") {
          const normalizedPayload = normalizePayload(event.payload);
          const equityValue = (normalizedPayload.equity ?? normalizedPayload.value) as number;
          setEquityHistory((prev) => [
            ...prev.slice(-100),
            { value: equityValue },
          ]);
        }

        if (event.type === "status") {
          refetch();
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", err);
      }
    };

    es.onerror = () => {
      setConnectionStatus("disconnected");
      es.close();
      eventSourceRef.current = null;

      if (session?.status === "running" || session?.status === "paused") {
        setConnectionStatus("reconnecting");
        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, 3000);
      }
    };
  }, [id, session, refetch]);

  useEffect(() => {
    const shouldConnect = session && (session.status === "running" || session.status === "paused" || session.status === "created");
    if (shouldConnect) {
      connectSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [session?.status, connectSSE]);

  const controlMutation = useMutation({
    mutationFn: async (action: "pause" | "resume" | "stop") => {
      const res = await apiRequest("POST", `/api/sim/sessions/${id}/control`, { action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sim/sessions", id] });
    },
    onError: (err: Error) => {
      toast({
        title: "Control action failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-8 w-8" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card className="p-6">
              <Skeleton className="h-64 w-full" />
            </Card>
          </div>
          <Card className="p-6">
            <Skeleton className="h-64 w-full" />
          </Card>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto pb-24">
        <PageHeader title="Session Not Found" backHref="/live-sessions" />
        <Card className="p-8">
          <EmptyState
            icon={Activity}
            title="Session not found"
            description="The requested session does not exist or has been deleted."
          />
        </Card>
      </div>
    );
  }

  const statusCfg = statusConfig[session.status] || statusConfig.created;
  const isActive = session.status === "running" || session.status === "paused" || session.status === "created";
  const isTerminal = session.status === "stopped" || session.status === "finished" || session.status === "failed";
  
  const equityPositive = equityHistory.length >= 2 
    ? equityHistory[equityHistory.length - 1].value >= equityHistory[0].value 
    : true;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto pb-24">
      <PageHeader
        title={`Session: ${session.profileSlug}`}
        subtitle={`Started ${format(new Date(session.createdAt), "MMM d, yyyy HH:mm")}`}
        backHref="/live-sessions"
        action={
          <div className="flex items-center gap-2">
            <Chip variant={statusCfg.chipVariant} size="md">
              {statusCfg.label}
            </Chip>
            {isActive && (
              <Chip 
                variant={connectionStatus === "connected" ? "success" : "warning"} 
                size="sm"
                icon={connectionStatus === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              >
                {connectionStatus === "connected" ? "Live" : connectionStatus === "reconnecting" ? "Reconnecting..." : "Offline"}
              </Chip>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Current Time</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {currentCandle 
              ? format(new Date(currentCandle.ts), "MMM d, yyyy HH:mm")
              : format(new Date(session.startMs), "MMM d, yyyy HH:mm")
            }
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold tabular-nums">
              {session.progress ? `${session.progress.pct.toFixed(1)}%` : "0%"}
            </p>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${session.progress?.pct || 0}%` }}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Speed</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{session.speed}x</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Event Feed</h3>
              <span className="text-xs text-muted-foreground">
                {events.length} events
              </span>
            </div>
            <EventFeed events={events} />
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Equity</h3>
            {equityHistory.length > 0 && (
              <span className={`text-sm font-medium ${equityPositive ? "text-positive" : "text-negative"}`}>
                ${equityHistory[equityHistory.length - 1]?.value?.toFixed(2) || "0.00"}
              </span>
            )}
          </div>
          
          {equityHistory.length > 1 ? (
            <div className="h-48">
              <Sparkline data={equityHistory} positive={equityPositive} height={192} />
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              Waiting for equity data...
            </div>
          )}
        </Card>
      </div>

      {isActive && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Session Controls</span>
            <div className="flex gap-2">
              {session.status === "running" ? (
                <Button
                  variant="outline"
                  onClick={() => controlMutation.mutate("pause")}
                  disabled={controlMutation.isPending}
                  data-testid="button-pause"
                >
                  {controlMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Pause className="w-4 h-4 mr-2" />
                  )}
                  Pause
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => controlMutation.mutate("resume")}
                  disabled={controlMutation.isPending}
                  data-testid="button-resume"
                >
                  {controlMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Resume
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => controlMutation.mutate("stop")}
                disabled={controlMutation.isPending}
                data-testid="button-stop"
              >
                {controlMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4 mr-2" />
                )}
                Stop
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isTerminal && (
        <Card className="p-4 bg-muted/30">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Activity className="w-4 h-4" />
            <span className="text-sm">
              Session {session.status}. View the event feed above for results.
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
