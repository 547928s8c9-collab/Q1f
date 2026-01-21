import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { BellRing } from "lucide-react";
import type { NotificationPreferences } from "@shared/schema";

const notificationChannels = [
  {
    key: "inAppEnabled",
    label: "In-app alerts",
    description: "Status updates and confirmations",
  },
  {
    key: "emailEnabled",
    label: "Email summaries",
    description: "Statements and security notices",
  },
  {
    key: "telegramEnabled",
    label: "Telegram alerts",
    description: "Real-time portfolio and transfer updates",
  },
] as const;

export default function SettingsNotifications() {
  useSetPageTitle("Notifications");
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notification-preferences"],
  });

  const hasAnyEnabled = Boolean(
    data?.inAppEnabled || data?.emailEnabled || data?.telegramEnabled
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Review how we keep you informed"
        backHref="/settings"
      />

      {isLoading ? (
        <Card className="p-6 space-y-4">
          {notificationChannels.map((channel) => (
            <div key={channel.key} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-64" />
            </div>
          ))}
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load preferences</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Please try again in a moment."}
          </AlertDescription>
        </Alert>
      ) : !hasAnyEnabled ? (
        <Card>
          <EmptyState
            icon={BellRing}
            title="Notifications are currently off"
            description="Enable alerts to stay informed about deposits, withdrawals, and security changes."
            action={{
              label: "Open Security Center",
              onClick: () => navigate("/settings/security"),
            }}
          />
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          {notificationChannels.map((channel) => {
            const enabled = Boolean(data?.[channel.key]);
            return (
              <div
                key={channel.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{channel.label}</p>
                  <p className="text-xs text-muted-foreground">{channel.description}</p>
                </div>
                <span
                  className={
                    enabled
                      ? "text-xs font-medium text-positive"
                      : "text-xs font-medium text-muted-foreground"
                  }
                >
                  {enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-end">
            <Button variant="outline" onClick={() => navigate("/settings/security")}>
              Manage preferences
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
