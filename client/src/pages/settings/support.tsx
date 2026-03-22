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
  useSetPageTitle("Поддержка");
  const [, navigate] = useLocation();
  const { isLoading, error } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const openRequests: Array<{ id: string; subject: string }> = [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Поддержка"
        subtitle="Получить помощь по аккаунту"
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
          <AlertTitle>Не удалось загрузить поддержку</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Пожалуйста, попробуйте позже."}
          </AlertDescription>
        </Alert>
      ) : openRequests.length === 0 ? (
        <Card>
          <EmptyState
            icon={LifeBuoy}
            title="Нет открытых обращений"
            description="Когда вы свяжетесь с нами, ваши обращения в поддержку появятся здесь."
            action={{
              label: "Проверить статус сервиса",
              onClick: () => navigate("/status"),
            }}
          />
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Открытые обращения</p>
            <p className="text-xs text-muted-foreground">
              У вас {openRequests.length} активных обращений.
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
                  <p className="text-xs text-muted-foreground">ID обращения: {request.id}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/inbox")}
                >
                  Посмотреть обновления
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
