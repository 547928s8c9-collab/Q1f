import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { UserRound } from "lucide-react";
import type { BootstrapResponse } from "@shared/schema";

export default function SettingsProfile() {
  useSetPageTitle("Profile");

  const { data, isLoading, error } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const displayName = [data?.user.firstName, data?.user.lastName].filter(Boolean).join(" ");
  const hasProfileDetails = Boolean(displayName || data?.user.email);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Profile"
        subtitle="Keep your account details accurate"
        backHref="/settings"
      />

      {isLoading ? (
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-56" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-48" />
          </div>
          <Skeleton className="h-20 w-full" />
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load profile</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </AlertDescription>
        </Alert>
      ) : !hasProfileDetails ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title="No profile details yet"
            description="Add your name and contact details to personalize your account."
          />
        </Card>
      ) : (
        <Card className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Full name</p>
              <p className="text-sm font-medium text-foreground">{displayName || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground">{data?.user.email ?? "—"}</p>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Profile editing will be available soon. For now, review your details above.
          </div>
        </Card>
      )}
    </div>
  );
}
