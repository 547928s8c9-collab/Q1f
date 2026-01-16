import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ComponentStatus {
  id: string;
  name: string;
  status: "operational" | "degraded" | "outage";
  description: string;
}

interface SystemStatus {
  overall: "operational" | "degraded" | "maintenance";
  message: string | null;
  components: ComponentStatus[];
  updatedAt: string;
}

const statusConfig = {
  operational: {
    label: "All Systems Operational",
    icon: CheckCircle2,
    color: "text-positive",
    bgColor: "bg-positive/10",
    borderColor: "border-positive/20",
  },
  degraded: {
    label: "Degraded Performance",
    icon: AlertTriangle,
    color: "text-warning",
    bgColor: "bg-warning/10",
    borderColor: "border-warning/20",
  },
  maintenance: {
    label: "Scheduled Maintenance",
    icon: Clock,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/20",
  },
  outage: {
    label: "Outage",
    icon: XCircle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/20",
  },
};

function ComponentCard({ component }: { component: ComponentStatus }) {
  const config = statusConfig[component.status];
  const Icon = config.icon;

  return (
    <div 
      className="flex items-center justify-between p-4 rounded-lg border bg-card"
      data-testid={`status-component-${component.id}`}
    >
      <div className="space-y-1">
        <h3 className="font-medium">{component.name}</h3>
        <p className="text-sm text-muted-foreground">{component.description}</p>
      </div>
      <div className={cn("flex items-center gap-2", config.color)}>
        <Icon className="h-5 w-5" />
        <span className="text-sm font-medium capitalize">{component.status}</span>
      </div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { data: status, isLoading, refetch, isFetching } = useQuery<SystemStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const overallConfig = status ? statusConfig[status.overall] : statusConfig.operational;
  const OverallIcon = overallConfig.icon;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="System Status"
        subtitle="Current platform health and service availability"
      />

      <div className="flex-1 overflow-auto px-4 pb-24 space-y-6">
        {isLoading ? (
          <StatusSkeleton />
        ) : status ? (
          <>
            <Card 
              className={cn(
                "p-6 border-2",
                overallConfig.bgColor,
                overallConfig.borderColor
              )}
              data-testid="status-overall"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-14 w-14 rounded-full flex items-center justify-center",
                  overallConfig.bgColor
                )}>
                  <OverallIcon className={cn("h-7 w-7", overallConfig.color)} />
                </div>
                <div className="flex-1">
                  <h2 className={cn("text-xl font-semibold", overallConfig.color)}>
                    {overallConfig.label}
                  </h2>
                  {status.message && (
                    <p className="text-sm text-muted-foreground mt-1">{status.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated: {new Date(status.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  data-testid="button-refresh-status"
                >
                  <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
                </Button>
              </div>
            </Card>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Components
              </h3>
              <div className="space-y-3">
                {status.components.map((component) => (
                  <ComponentCard key={component.id} component={component} />
                ))}
              </div>
            </div>

            <Card className="p-5">
              <h3 className="font-medium mb-2">Need Help?</h3>
              <p className="text-sm text-muted-foreground">
                If you're experiencing issues not reflected here, please contact our support team
                for assistance.
              </p>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
