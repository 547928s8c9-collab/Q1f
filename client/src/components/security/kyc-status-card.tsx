import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  ChevronRight,
  User
} from "lucide-react";
import { Link } from "wouter";

type KycStatus = "not_started" | "pending" | "in_review" | "approved" | "needs_action" | "rejected" | "on_hold";

interface KycStatusCardProps {
  status: KycStatus;
  onStartVerification?: () => void;
}

const statusConfig: Record<KycStatus, {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  chipVariant: "default" | "success" | "warning" | "danger" | "primary";
  chipText: string;
  showAction: boolean;
  actionText?: string;
}> = {
  not_started: {
    icon: User,
    title: "Требуется верификация личности",
    description: "Пройдите верификацию, чтобы разблокировать все функции, включая вывод средств и повышенные лимиты.",
    chipVariant: "warning",
    chipText: "Не начата",
    showAction: true,
    actionText: "Пройти сейчас",
  },
  pending: {
    icon: Clock,
    title: "Верификация ожидается",
    description: "Ваша верификация ожидает обработки. Пожалуйста, завершите процесс верификации.",
    chipVariant: "default",
    chipText: "Ожидание",
    showAction: true,
    actionText: "Продолжить",
  },
  in_review: {
    icon: Clock,
    title: "Верификация на рассмотрении",
    description: "Мы проверяем ваши документы. Обычно это занимает 1-2 рабочих дня.",
    chipVariant: "primary",
    chipText: "На рассмотрении",
    showAction: false,
  },
  approved: {
    icon: ShieldCheck,
    title: "Личность подтверждена",
    description: "Ваша личность подтверждена. У вас есть полный доступ ко всем функциям.",
    chipVariant: "success",
    chipText: "Подтверждено",
    showAction: false,
  },
  needs_action: {
    icon: AlertTriangle,
    title: "Требуется действие",
    description: "Для завершения верификации необходима дополнительная информация.",
    chipVariant: "danger",
    chipText: "Требуется действие",
    showAction: true,
    actionText: "Обновить сейчас",
  },
  rejected: {
    icon: XCircle,
    title: "Верификация отклонена",
    description: "Ваша верификация не была одобрена. Пожалуйста, обратитесь в поддержку за помощью.",
    chipVariant: "danger",
    chipText: "Отклонена",
    showAction: true,
    actionText: "Связаться с поддержкой",
  },
  on_hold: {
    icon: Clock,
    title: "Верификация приостановлена",
    description: "Ваша верификация приостановлена для ручной проверки. Мы уведомим вас об обновлениях.",
    chipVariant: "warning",
    chipText: "Приостановлена",
    showAction: false,
  },
};

export function KycStatusCard({ status, onStartVerification }: KycStatusCardProps) {
  const config = statusConfig[status] || statusConfig.not_started;
  const Icon = config.icon;

  const isVerified = status === "approved";
  const needsAction = status === "not_started" || status === "pending" || status === "needs_action";

  return (
    <Card 
      className={`p-5 ${isVerified ? 'border-success/30 bg-success/5' : needsAction ? 'border-warning/30 bg-warning/5' : ''}`}
      data-testid="card-kyc-status"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
          isVerified ? 'bg-success/20' : 
          needsAction ? 'bg-warning/20' : 
          'bg-muted'
        }`}>
          <Icon className={`w-6 h-6 ${
            isVerified ? 'text-success' : 
            needsAction ? 'text-warning' : 
            'text-muted-foreground'
          }`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">{config.title}</h3>
            <Chip variant={config.chipVariant} size="sm" data-testid="chip-kyc-status">
              {config.chipText}
            </Chip>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{config.description}</p>

          {config.showAction && (
            <Button
              variant={needsAction ? "default" : "outline"}
              size="sm"
              onClick={onStartVerification}
              data-testid="button-kyc-action"
            >
              {config.actionText}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
