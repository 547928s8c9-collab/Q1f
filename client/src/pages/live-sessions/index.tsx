import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { Activity, Shield, TrendingUp, Zap, Clock, ChevronRight, Play, Info } from "lucide-react";

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

const riskConfig: Record<string, { color: string; chipVariant: "success" | "warning" | "danger"; icon: React.ElementType; label: string }> = {
  low: { color: "bg-positive/10 text-positive", chipVariant: "success", icon: Shield, label: "Low Risk" },
  medium: { color: "bg-warning/10 text-warning", chipVariant: "warning", icon: TrendingUp, label: "Medium Risk" },
  high: { color: "bg-negative/10 text-negative", chipVariant: "danger", icon: Zap, label: "High Risk" },
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

  const { data, isLoading, error } = useQuery<ProfilesResponse>({
    queryKey: ["/api/strategy-profiles"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const profiles = data?.profiles || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader
        title="Live Sessions"
        subtitle="Run strategy sessions with real market data"
      />

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
