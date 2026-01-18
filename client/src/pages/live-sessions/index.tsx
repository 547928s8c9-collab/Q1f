import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { Sparkline } from "@/components/charts/sparkline";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Activity, Shield, TrendingUp, Zap, Clock, ChevronRight, Play, Info, Loader2 } from "lucide-react";

interface StrategyProfile {
  id: string;
  slug: string;
  displayName: string;
  symbol: string;
  timeframe: string;
  description: string;
  tags: string[];
  riskLevel: "low" | "medium" | "high";
  isEnabled: boolean;
}

interface ProfilesResponse {
  profiles: StrategyProfile[];
}

interface StartAllSession {
  profileSlug: string;
  sessionId: string;
}

interface StartAllResponse {
  sessions: StartAllSession[];
}

interface SimSession {
  id: string;
  profileSlug: string;
  status: "created" | "running" | "paused" | "stopped" | "finished" | "failed";
  startMs: number;
  endMs: number | null;
  speed: number;
  lastSeq: number;
  createdAt: string;
}

interface SimEvent {
  seq: number;
  type: "candle" | "trade" | "equity" | "status" | "error";
  ts: number;
  payload: Record<string, unknown>;
}

interface SimEventsResponse {
  events: SimEvent[];
  lastSeq: number;
}

const riskConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger"; icon: React.ElementType; label: string }> = {
  low: { color: "bg-positive/10 text-positive", chipVariant: "success", icon: Shield, label: "Low Risk" },
  medium: { color: "bg-warning/10 text-warning", chipVariant: "warning", icon: TrendingUp, label: "Medium Risk" },
  high: { color: "bg-negative/10 text-negative", chipVariant: "danger", icon: Zap, label: "High Risk" },
};

const statusConfig: Record<string, { chipVariant: "success" | "warning" | "danger" | "default"; label: string }> = {
  created: { chipVariant: "default", label: "Created" },
  running: { chipVariant: "success", label: "Running" },
  paused: { chipVariant: "warning", label: "Paused" },
  stopped: { chipVariant: "default", label: "Stopped" },
  finished: { chipVariant: "success", label: "Finished" },
  failed: { chipVariant: "danger", label: "Failed" },
};

function ProfileCardSkeleton() {
  return (
    <div className="p-5 rounded-xl border border-card-border bg-card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-11 h-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="w-5 h-5" />
      </div>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-4" />
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-1" />
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: StrategyProfile }) {
  const [, setLocation] = useLocation();
  const config = riskConfig[profile.riskLevel] || riskConfig.medium;
  const Icon = config.icon;

  const handleStartSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/live-sessions/${profile.slug}`);
  };

  const handleViewDetails = () => {
    setLocation(`/live-sessions/${profile.slug}`);
  };

  return (
    <Card
      className="p-5 hover-elevate cursor-pointer transition-all border border-card-border hover:border-primary/30"
      data-testid={`profile-card-${profile.slug}`}
      onClick={handleViewDetails}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleViewDetails()}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground truncate">{profile.displayName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground font-medium">{profile.symbol}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {profile.timeframe}
              </span>
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </div>

      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {profile.description}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <Chip variant={config.chipVariant} size="sm">
          {config.label}
        </Chip>
        {profile.tags.slice(0, 2).map((tag) => (
          <Chip key={tag} variant="outline" size="sm">
            {tag}
          </Chip>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          className="flex-1"
          onClick={handleStartSession}
          data-testid={`button-start-session-${profile.slug}`}
        >
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Start Session
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleViewDetails();
          }}
          data-testid={`button-details-${profile.slug}`}
        >
          <Info className="w-3.5 h-3.5 mr-1.5" />
          Details
        </Button>
      </div>
    </Card>
  );
}

function OverviewCard({
  sessionId,
  profile,
  session,
}: {
  sessionId: string;
  profile: StrategyProfile | undefined;
  session?: SimSession;
}) {
  const [, setLocation] = useLocation();

  const { data: eventsData } = useQuery<SimEventsResponse>({
    queryKey: ["/api/sim/sessions", sessionId, "events", "overview"],
    enabled: !!sessionId,
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await fetch(`/api/sim/sessions/${sessionId}/events?limit=120`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to load session events");
      }
      return res.json() as Promise<SimEventsResponse>;
    },
  });

  const events = eventsData?.events ?? [];
  const equityEvents = events.filter((event) => event.type === "equity");
  const tradeCount = events.filter((event) => event.type === "trade").length;
  const sparklineData = equityEvents.slice(-30).map((event) => ({
    value: Number(event.payload.value ?? 0),
  }));

  const equityValue = equityEvents.length
    ? Number(equityEvents[equityEvents.length - 1].payload.value ?? 0)
    : 0;

  const isPositive = sparklineData.length > 1
    ? sparklineData[sparklineData.length - 1].value - sparklineData[0].value >= 0
    : true;

  const statusCfg = statusConfig[session?.status ?? "created"] ?? statusConfig.created;

  return (
    <Card
      className="p-4 hover-elevate cursor-pointer transition-all border border-card-border"
      onClick={() => setLocation(`/live-sessions/session/${sessionId}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && setLocation(`/live-sessions/session/${sessionId}`)}
      data-testid={`overview-session-${sessionId}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {profile?.displayName ?? session?.profileSlug ?? "Live Session"}
          </p>
          <p className="text-xs text-muted-foreground">
            {profile?.symbol ?? ""} {profile?.timeframe ? `· ${profile.timeframe}` : ""}
          </p>
        </div>
        <Chip variant={statusCfg.chipVariant} size="sm">
          {statusCfg.label}
        </Chip>
      </div>

      <div className="mb-3">
        {sparklineData.length > 0 ? (
          <Sparkline data={sparklineData} positive={isPositive} height={36} />
        ) : (
          <div className="h-9 rounded-md bg-muted/40" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Equity</p>
          <p className="font-semibold tabular-nums">
            ${equityValue.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Trades</p>
          <p className="font-semibold tabular-nums">
            {tradeCount}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function LiveSessions() {
  useSetPageTitle("Live Sessions");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startedSessions, setStartedSessions] = useState<StartAllSession[]>([]);

  const { data, isLoading, error } = useQuery<ProfilesResponse>({
    queryKey: ["/api/strategy-profiles"],
  });

  const startAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live-sessions/start-all");
      return res.json() as Promise<StartAllResponse>;
    },
    onSuccess: (response) => {
      setStartedSessions(response.sessions);
      queryClient.invalidateQueries({ queryKey: ["/api/sim/sessions"] });
      toast({
        title: "All sessions started",
        description: `Started ${response.sessions.length} live sessions.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to start sessions",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery<{ sessions: SimSession[] }>({
    queryKey: ["/api/sim/sessions"],
    enabled: startedSessions.length > 0,
  });

  const profiles = data?.profiles || [];

  const sessionsById = useMemo(() => {
    const map = new Map<string, SimSession>();
    sessionsData?.sessions.forEach((session) => {
      map.set(session.id, session);
    });
    return map;
  }, [sessionsData?.sessions]);

  const profilesBySlug = useMemo(() => {
    const map = new Map<string, StrategyProfile>();
    profiles.forEach((profile) => {
      map.set(profile.slug, profile);
    });
    return map;
  }, [profiles]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Live Sessions"
        subtitle="Run strategy sessions with real market data"
        action={(
          <Button
            variant="default"
            onClick={() => startAllMutation.mutate()}
            disabled={startAllMutation.isPending}
            data-testid="button-start-all"
          >
            {startAllMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start All
              </>
            )}
          </Button>
        )}
      />

      {startedSessions.length > 0 && (
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Overview</h2>
              <p className="text-sm text-muted-foreground">Live session health and performance snapshots</p>
            </div>
          </div>
          {sessionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {startedSessions.map((session) => (
                <div key={session.sessionId} className="p-4 rounded-xl border border-card-border bg-card">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24 mb-4" />
                  <Skeleton className="h-9 w-full mb-3" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {startedSessions.map((session) => (
                <OverviewCard
                  key={session.sessionId}
                  sessionId={session.sessionId}
                  profile={profilesBySlug.get(session.profileSlug)}
                  session={sessionsById.get(session.sessionId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProfileCardSkeleton />
          <ProfileCardSkeleton />
          <ProfileCardSkeleton />
          <ProfileCardSkeleton />
        </div>
      ) : error ? (
        <Card className="p-8">
          <EmptyState
            icon={Activity}
            title="Unable to load profiles"
            description="There was an error loading strategy profiles. Please try again."
          />
        </Card>
      ) : profiles.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={Activity}
            title="No strategy profiles available"
            description="Strategy profiles will appear here once configured."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
