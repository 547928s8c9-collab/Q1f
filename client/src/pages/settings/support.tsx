import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { LifeBuoy } from "lucide-react";
import type { BootstrapResponse } from "@shared/schema";

export default function SettingsSupport() {
  useSetPageTitle("Support");
  const [, navigate] = useLocation();
  const { isLoading, error } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const openRequests: Array<{ id: string; subject: string }> = [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Support"
        subtitle="Get help with your account"
        backHref="/settings"
      />

      {isLoading ? (
        <Card className="p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load support</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </AlertDescription>
        </Alert>
      ) : openRequests.length === 0 ? (
        <Card>
          <EmptyState
            icon={LifeBuoy}
            title="No open requests"
            description="When you contact us, your support requests will appear here."
            action={{
              label: "Check service status",
              onClick: () => navigate("/status"),
            }}
          />
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Open requests</p>
            <p className="text-xs text-muted-foreground">
              You currently have {openRequests.length} active request(s).
            </p>
          </div>
          <div className="space-y-3">
            {openRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{request.subject}</p>
                  <p className="text-xs text-muted-foreground">Request ID: {request.id}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/inbox")}
                >
                  View updates
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
