import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkline } from "@/components/charts/sparkline";
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

interface OverviewSession {
  profileSlug: string;
  sessionId: string;
  status: string;
  equity: number;
  tradesCount: number;
  symbol: string;
  timeframe: string;
  sparkline: Array<{ value: number }>;
}

const riskConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger"; icon: React.ElementType; label: string }> = {
  low: { color: "bg-positive/10 text-positive", chipVariant: "success", icon: Shield, label: "Low Risk" },
  medium: { color: "bg-warning/10 text-warning", chipVariant: "warning", icon: TrendingUp, label: "Medium Risk" },
  high: { color: "bg-negative/10 text-negative", chipVariant: "danger", icon: Zap, label: "High Risk" },
};

const sessionStatusConfig: Record<string, { chipVariant: "success" | "warning" | "danger" | "default"; label: string }> = {
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

export default function LiveSessions() {
  useSetPageTitle("Live Sessions");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [overviewSessions, setOverviewSessions] = useState<StartAllSession[]>([]);

  const { data, isLoading, error, refetch } = useQuery<ProfilesResponse>({
    queryKey: ["/api/strategy-profiles"],
  });

  const profiles = data?.profiles || [];
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.slug, profile])), [profiles]);

  const startAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/live-sessions/start-all", {});
      const payload = await res.json();
      const sessions = Array.isArray(payload) ? payload : payload.sessions || [];
      return sessions as StartAllSession[];
    },
    onSuccess: (sessions) => {
      setOverviewSessions(sessions);
      toast({
        title: "Live sessions started",
        description: `${sessions.length} sessions running.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Start all failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { data: overviewData, isLoading: overviewLoading } = useQuery<OverviewSession[]>({
    queryKey: ["/api/live-sessions/overview", overviewSessions.map((s) => s.sessionId).join(",")],
    enabled: overviewSessions.length > 0,
    refetchInterval: 5000,
    queryFn: async () => {
      const results = await Promise.all(
        overviewSessions.map(async (session) => {
          const sessionRes = await apiRequest("GET", `/api/live-sessions/${session.sessionId}`);
          const sessionData = await sessionRes.json();
          const eventsRes = await apiRequest("GET", `/api/sim/sessions/${session.sessionId}/events?limit=60`);
          const eventsData = await eventsRes.json();
          const sparkline = (eventsData?.events || [])
            .filter((event: { type?: string }) => event.type === "equity")
            .map((event: { payload?: { data?: { equity?: number } } }) => ({
              value: typeof event.payload?.data?.equity === "number" ? event.payload.data.equity : 0,
            }))
            .slice(-30);

          return {
            profileSlug: session.profileSlug,
            sessionId: session.sessionId,
            status: sessionData.status,
            equity: sessionData.equity ?? 0,
            tradesCount: sessionData.tradesCount ?? 0,
            symbol: sessionData.symbols?.[0] || "",
            timeframe: sessionData.timeframe || "",
            sparkline,
          };
        })
      );
      return results;
    },
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Live Sessions"
        subtitle="Run strategy sessions with real market data"
        action={
          <Button
            variant="brand"
            onClick={() => startAllMutation.mutate()}
            disabled={startAllMutation.isPending}
            data-testid="button-start-all"
          >
            {startAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Start All
          </Button>
        }
      />

      {overviewSessions.length > 0 && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Live Sessions Overview</h2>
            <span className="text-xs text-muted-foreground">
              {overviewSessions.length} sessions
            </span>
          </div>
          {overviewLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Card key={idx} className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-16 mb-4" />
                  <Skeleton className="h-10 w-full mb-3" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-10" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(overviewData || []).map((session) => {
                const profile = profileMap.get(session.profileSlug);
                const status = sessionStatusConfig[session.status] || sessionStatusConfig.created;
                return (
                  <Card
                    key={session.sessionId}
                    className="p-4 cursor-pointer hover-elevate transition-all border border-card-border"
                    onClick={() => setLocation(`/live-sessions/session/${session.sessionId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setLocation(`/live-sessions/session/${session.sessionId}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{profile?.displayName || session.profileSlug}</p>
                        <p className="text-xs text-muted-foreground">
                          {session.symbol} · {session.timeframe}
                        </p>
                      </div>
                      <Chip variant={status.chipVariant} size="sm">
                        {status.label}
                      </Chip>
                    </div>
                    <div className="h-16 mb-3">
                      {session.sparkline.length > 1 ? (
                        <Sparkline data={session.sparkline} positive height={64} />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                          Waiting for equity...
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Equity</span>
                      <span className="font-medium text-foreground">
                        ${session.equity.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>Trades</span>
                      <span className="font-medium text-foreground">
                        {session.tradesCount}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
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
            action={{ label: "Retry", onClick: () => void refetch() }}
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
