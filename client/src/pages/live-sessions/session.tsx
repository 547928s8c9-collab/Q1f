import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Wifi, WifiOff, Loader2,
  ArrowUpRight, CircleDot, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

interface LiveSession {
  id: string;
  profileSlug: string;
  status: "created" | "running" | "paused" | "stopped" | "finished" | "failed";
  tradingStatus?: "active" | "loading_history" | "warming_up" | "paused_insufficient_history";
  tradingPausedReason?: string | null;
  startMs: number;
  createdAt: string;
  timeframe: string;
  symbols: string[];
  lastUpdate: number | null;
  equity: number;
  tradesCount: number;
  streamUrl: string;
}

interface SimEvent {
  seq: number;
  type: "candle" | "trade" | "equity" | "status" | "error";
  ts: number;
  payload: Record<string, unknown>;
}

interface MarketQuote {
  symbol: string;
  ts: number;
  price: number;
}

interface MarketCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketQuotesResponse {
  quotes: MarketQuote[];
  simNow?: number;
}

interface MarketCandlesResponse {
  success: boolean;
  data: {
    candles: MarketCandle[];
    simNow?: number;
  };
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

const TIMEFRAME_MS: Record<string, number> = {
  "1m": 60_000,
  "15m": 900_000,
  "1h": 3_600_000,
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
    const data = (payload as { data?: Record<string, unknown> })?.data || {};
    if (type === "trade") {
      return data.side === "LONG" ? "text-positive" : "text-negative";
    }
    if (type === "equity") {
      const equity = Number(data.equity ?? 0);
      return equity >= 10000 ? "text-positive" : "text-negative";
    }
    return "text-muted-foreground";
  };

  const formatPayload = (type: string, payload: Record<string, unknown>) => {
    const data = (payload as { data?: Record<string, unknown> })?.data || {};
    if (type === "trade") {
      const side = data.side as string;
      const price = (data.exitPrice ?? data.price ?? data.entryPrice) as number;
      const qty = data.qty as number;
      return `${side?.toUpperCase()} ${qty} @ ${price?.toFixed(2)}`;
    }
    if (type === "equity") {
      const value = data.equity as number;
      const drawdown = data.drawdownPct as number;
      return `$${value?.toFixed(2)} (DD ${drawdown?.toFixed(2)}%)`;
    }
    if (type === "candle") {
      const candle = data.candle as { close?: number } | undefined;
      return `Close: ${candle?.close?.toFixed(2)}`;
    }
    if (type === "status") {
      return (payload.status as string) || (data.status as string);
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
        events.slice(-50).map((event) => (
          <div
            key={event.seq}
            className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-sm"
            data-testid={`event-${event.seq}`}
          >
            <span className={getEventColor(event.type, event.payload)}>
              {getEventIcon(event.type)}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {format(new Date(event.ts), "HH:mm:ss")}
            </span>
            <span className="text-xs font-medium uppercase text-muted-foreground w-12">
              {event.type}
            </span>
            <span className={`flex-1 truncate ${getEventColor(event.type, event.payload)}`}>
              {formatPayload(event.type, event.payload)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function CandleChart({ candles }: { candles: MarketCandle[] }) {
  if (!candles || candles.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
        Waiting for candles...
      </div>
    );
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const range = Math.max(1e-6, maxHigh - minLow);

  const height = 100;
  const candleSpacing = 3;
  const width = candles.length * candleSpacing;

  const scaleY = (value: number) => height - ((value - minLow) / range) * height;

  return (
    <div className="h-52 w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {candles.map((candle, index) => {
          const x = index * candleSpacing + 1;
          const openY = scaleY(candle.open);
          const closeY = scaleY(candle.close);
          const highY = scaleY(candle.high);
          const lowY = scaleY(candle.low);
          const up = candle.close >= candle.open;
          const color = up ? "#22c55e" : "#ef4444";
          const bodyY = Math.min(openY, closeY);
          const bodyH = Math.max(1, Math.abs(closeY - openY));

          return (
            <g key={candle.ts}>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
              <rect x={x - 1} y={bodyY} width={2} height={bodyH} fill={color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function formatSymbol(symbol?: string): string {
  if (!symbol) return "";
  if (symbol.includes("/")) return symbol;
  return symbol.replace("USDT", "/USDT");
}

export default function LiveSessionView() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [equityHistory, setEquityHistory] = useState<Array<{ value: number }>>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [marketStatus, setMarketStatus] = useState<ConnectionStatus>("disconnected");
  const [latestQuote, setLatestQuote] = useState<MarketQuote | null>(null);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const marketSourceRef = useRef<EventSource | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const marketReconnectRef = useRef<NodeJS.Timeout | null>(null);

  const { data: session, isLoading, error, refetch } = useQuery<LiveSession>({
    queryKey: ["/api/live-sessions", id],
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

  const symbolsParam = session?.symbols?.join(",") || "";
  const primarySymbol = session?.symbols?.[0];
  const chartTimeframe = "1m";

  const { data: quoteSnapshot, refetch: refetchQuotes } = useQuery<MarketQuotesResponse>({
    queryKey: ["/api/market/quotes", { symbols: symbolsParam }],
    enabled: !!symbolsParam,
    refetchInterval: false,
  });

  const { data: candleSnapshot } = useQuery<MarketCandlesResponse>({
    queryKey: ["/api/market/candles", { symbol: primarySymbol, timeframe: chartTimeframe, limit: 120 }],
    enabled: !!primarySymbol && !!session?.timeframe,
    refetchInterval: false,
  });

  const timeframeMs = useMemo(() => TIMEFRAME_MS[chartTimeframe] || 60_000, [chartTimeframe]);

  const applyQuoteToCandles = useCallback((prev: MarketCandle[], quote: MarketQuote) => {
    if (!prev || prev.length === 0) return prev;
    const candleStart = Math.floor(quote.ts / timeframeMs) * timeframeMs;
    const last = prev[prev.length - 1];
    if (last && last.ts === candleStart) {
      const updated = {
        ...last,
        close: quote.price,
        high: Math.max(last.high, quote.price),
        low: Math.min(last.low, quote.price),
      };
      return [...prev.slice(0, -1), updated];
    }
    if (last && candleStart > last.ts) {
      return [
        ...prev,
        {
          ts: candleStart,
          open: quote.price,
          high: quote.price,
          low: quote.price,
          close: quote.price,
          volume: 0,
        },
      ].slice(-120);
    }
    return prev;
  }, [timeframeMs]);

  useSetPageTitle(session ? `Session ${session.profileSlug}` : "Live Session");

  const connectSSE = useCallback(() => {
    if (!id || !session) return;
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setConnectionStatus("connecting");
    const baseUrl = session.streamUrl || `/api/sim/sessions/${id}/stream`;
    const url = `${baseUrl}?fromSeq=${lastSeqRef.current}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnectionStatus("connected");
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SimEvent;
        if (!event?.type) return;

        lastSeqRef.current = event.seq;
        setEvents((prev) => [...prev.slice(-200), event]);

        const data = (event.payload as { data?: Record<string, unknown> })?.data || {};

        if (event.type === "equity") {
          const equity = data.equity as number;
          if (typeof equity === "number") {
            setEquityHistory((prev) => [
              ...prev.slice(-100),
              { value: equity },
            ]);
          }
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

  const connectMarketSSE = useCallback(() => {
    if (!session || session.symbols.length === 0) return;

    if (marketSourceRef.current) {
      marketSourceRef.current.close();
    }

    setMarketStatus("connecting");
    const streamUrl = `/api/market/stream?symbols=${encodeURIComponent(session.symbols.join(","))}`;
    const es = new EventSource(streamUrl, { withCredentials: true });
    marketSourceRef.current = es;

    es.onopen = () => {
      setMarketStatus("connected");
      refetchQuotes();
    };

    es.addEventListener("quote", (e) => {
      try {
        const quote = JSON.parse((e as MessageEvent).data) as MarketQuote;
        setLatestQuote(quote);
        setCandles((prev) => applyQuoteToCandles(prev, quote));
      } catch (err) {
        console.error("Failed to parse market quote:", err);
      }
    });

    es.onerror = () => {
      setMarketStatus("disconnected");
      es.close();
      marketSourceRef.current = null;

      if (!marketReconnectRef.current) {
        setMarketStatus("reconnecting");
        marketReconnectRef.current = setTimeout(() => {
          marketReconnectRef.current = null;
          connectMarketSSE();
        }, 3000);
      }
    };
  }, [applyQuoteToCandles, refetchQuotes, session]);

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

  useEffect(() => {
    if (!quoteSnapshot?.quotes || !primarySymbol) return;
    const match = quoteSnapshot.quotes.find((q) => q.symbol === primarySymbol);
    if (match) {
      setLatestQuote(match);
    }
  }, [quoteSnapshot, primarySymbol]);

  useEffect(() => {
    if (candleSnapshot?.data?.candles) {
      setCandles(candleSnapshot.data.candles);
    }
  }, [candleSnapshot]);

  useEffect(() => {
    if (session && equityHistory.length === 0 && typeof session.equity === "number") {
      setEquityHistory([{ value: session.equity }]);
    }
  }, [session?.equity, equityHistory.length]);

  useEffect(() => {
    if (!session || session.symbols.length === 0) return;
    connectMarketSSE();

    return () => {
      if (marketSourceRef.current) {
        marketSourceRef.current.close();
        marketSourceRef.current = null;
      }
      if (marketReconnectRef.current) {
        clearTimeout(marketReconnectRef.current);
        marketReconnectRef.current = null;
      }
    };
  }, [connectMarketSSE, session?.id, session?.symbols?.join(",")]);

  const controlMutation = useMutation({
    mutationFn: async (action: "pause" | "resume" | "stop") => {
      const res = await apiRequest("POST", `/api/live-sessions/${id}/control`, { action });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-sessions", id] });
    },
    onError: (err: Error) => {
      toast({
        title: "Control action failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/live-sessions/${id}/start`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-sessions", id] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to start session",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (session?.status === "created" && !startMutation.isPending) {
      startMutation.mutate();
    }
  }, [session?.status, startMutation]);

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
  const tradingPaused = session.tradingStatus && session.tradingStatus !== "active";
  const tradingStatusMessage = (() => {
    if (session.tradingPausedReason) return session.tradingPausedReason;
    if (session.tradingStatus === "warming_up") return "Warming up strategy";
    return "Loading history and warming up strategy";
  })();
  
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

      {tradingPaused && (
        <Card className="p-4 mb-4 border-warning/40 bg-warning/10">
          <div className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle className="w-4 h-4" />
            <span>
              Trading paused — {tradingStatusMessage}
            </span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Sim Time</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {latestQuote?.ts
              ? format(new Date(latestQuote.ts), "MMM d, yyyy HH:mm")
              : format(new Date(session.startMs), "MMM d, yyyy HH:mm")
            }
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Live Price</span>
            </div>
            <Chip
              variant={marketStatus === "connected" ? "success" : "warning"}
              size="sm"
              icon={marketStatus === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            >
              {marketStatus === "connected" ? "Feed" : marketStatus === "reconnecting" ? "Reconnecting..." : "Offline"}
            </Chip>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {latestQuote ? `${latestQuote.price.toFixed(4)} ${formatSymbol(primarySymbol)}` : "--"}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Trades</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{session.tradesCount}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Market Candles</h3>
              <span className="text-xs text-muted-foreground">
                {primarySymbol || "—"} · {chartTimeframe} feed
              </span>
            </div>
            <CandleChart candles={candles} />
          </Card>

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
              {session.status === "created" ? (
                <Button
                  variant="default"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  data-testid="button-start"
                >
                  {startMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Start
                </Button>
              ) : session.status === "running" ? (
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
