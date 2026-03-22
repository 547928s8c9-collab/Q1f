import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyButton } from "@/components/ui/copy-button";
import { OperationTimeline } from "@/components/operations/operation-timeline";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { formatMoney, getOperationCopy, type Operation } from "@shared/schema";

export default function Receipt() {
  const params = useParams<{ operationId: string }>();

  const { data: operation, isLoading } = useQuery<Operation>({
    queryKey: ["/api/operations", params.operationId],
  });

  const copy = operation ? getOperationCopy(operation.type, operation.status, { strategyName: operation.strategyName }) : null;

  const getTimelineSteps = () => {
    if (!operation) return [];

    const steps = [];

    if (operation.type.includes("DEPOSIT")) {
      steps.push({
        label: "Инициирован",
        status: "completed" as const,
        timestamp: operation.createdAt ? new Date(operation.createdAt).toLocaleString("ru-RU") : undefined,
      });
      steps.push({
        label: "Обработка",
        status: operation.status === "pending" ? "current" as const : "completed" as const,
      });
      steps.push({
        label: "Зачислен",
        status: operation.status === "completed" ? "completed" as const : "pending" as const,
      });
    } else if (operation.type.includes("WITHDRAW")) {
      steps.push({
        label: "Запрос отправлен",
        status: "completed" as const,
        timestamp: operation.createdAt ? new Date(operation.createdAt).toLocaleString("ru-RU") : undefined,
      });
      steps.push({
        label: "Проверка",
        status: operation.status === "pending" ? "current" as const : "completed" as const,
      });
      steps.push({
        label: "Отправка",
        status: operation.status === "processing" ? "current" as const : operation.status === "completed" ? "completed" as const : "pending" as const,
      });
      steps.push({
        label: "Подтверждён",
        status: operation.status === "completed" ? "completed" as const : operation.status === "failed" ? "failed" as const : "pending" as const,
      });
    } else {
      steps.push({
        label: "Создан",
        status: "completed" as const,
        timestamp: operation.createdAt ? new Date(operation.createdAt).toLocaleString("ru-RU") : undefined,
      });
      steps.push({
        label: operation.status === "completed" ? "Выполнен" : operation.status === "failed" ? "Ошибка" : "Обработка",
        status: operation.status === "completed" ? "completed" as const : operation.status === "failed" ? "failed" as const : "current" as const,
      });
    }

    return steps;
  };

  const DetailRow = ({ label, value, copyable }: { label: string; value?: string | null; copyable?: boolean }) => {
    if (!value) return null;
    return (
      <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums truncate max-w-[200px]">{value}</span>
          {copyable && <CopyButton value={value} />}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto">
      <PageHeader title="Детали транзакции" backHref="/activity" />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : operation ? (
        <>
          <Card className="p-5 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{copy?.title}</h2>
                <p className="text-sm text-muted-foreground">{copy?.subtitle}</p>
              </div>
              <StatusBadge status={operation.status} />
            </div>
            {operation.amount && operation.asset && (
              <div className="text-center py-4">
                <p className="text-3xl font-semibold tabular-nums">
                  {formatMoney(operation.amount, operation.asset)}
                </p>
                <p className="text-sm text-muted-foreground">{operation.asset}</p>
              </div>
            )}
          </Card>

          <Card className="p-5 mb-6">
            <h3 className="font-medium mb-4">Хронология</h3>
            <OperationTimeline steps={getTimelineSteps()} />
          </Card>

          <Card className="p-5">
            <h3 className="font-medium mb-2">Подробности</h3>
            <DetailRow label="ID операции" value={operation.id} copyable />
            <DetailRow label="Тип" value={operation.type} />
            <DetailRow
              label="Дата"
              value={operation.createdAt ? new Date(operation.createdAt).toLocaleString("ru-RU") : undefined}
            />
            <DetailRow label="Хеш транзакции" value={operation.txHash} copyable />
            <DetailRow label="Ссылка провайдера" value={operation.providerRef} copyable />
            <DetailRow label="Стратегия" value={operation.strategyName} />
            {operation.fee && BigInt(operation.fee) > BigInt(0) && (
              <DetailRow label="Комиссия" value={`${formatMoney(operation.fee, operation.asset || "USDT")} ${operation.asset || "USDT"}`} />
            )}
            {operation.reason && <DetailRow label="Причина" value={operation.reason} />}
          </Card>
        </>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Транзакция не найдена</p>
        </Card>
      )}
    </div>
  );
}
