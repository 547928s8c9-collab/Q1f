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
  useSetPageTitle("Профиль");

  const { data, isLoading, error } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const displayName = [data?.user.firstName, data?.user.lastName].filter(Boolean).join(" ");
  const hasProfileDetails = Boolean(displayName || data?.user.email);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Профиль"
        subtitle="Проверьте данные вашего аккаунта"
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
          <AlertTitle>Не удалось загрузить профиль</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Пожалуйста, попробуйте позже."}
          </AlertDescription>
        </Alert>
      ) : !hasProfileDetails ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title="Данные профиля отсутствуют"
            description="Добавьте имя и контактные данные для персонализации аккаунта."
          />
        </Card>
      ) : (
        <Card className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Полное имя</p>
              <p className="text-sm font-medium text-foreground">{displayName || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Эл. почта</p>
              <p className="text-sm font-medium text-foreground">{data?.user.email ?? "—"}</p>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Редактирование профиля скоро будет доступно. Пока вы можете просмотреть свои данные выше.
          </div>
        </Card>
      )}
    </div>
  );
}
