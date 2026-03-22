import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { type BootstrapResponse } from "@shared/schema";
import {
  Shield,
  User,
  Bell,
  HelpCircle,
  FileText,
  ChevronRight,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface SettingsLinkProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  href: string;
  badge?: React.ReactNode;
}

function SettingsLink({ icon, label, description, href, badge }: SettingsLinkProps) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-4 p-4 rounded-lg hover-elevate cursor-pointer transition-colors">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {badge}
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}

export default function Settings() {
  useSetPageTitle("Настройки");
  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Настройки" />

      <div className="space-y-4">
        <Card className="divide-y divide-border">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Аккаунт</h3>
          </div>
          <SettingsLink
            icon={<User className="w-5 h-5 text-muted-foreground" />}
            label="Профиль"
            description="Управление данными аккаунта"
            href="/settings/profile"
          />
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Верификация личности</p>
              <p className="text-xs text-muted-foreground">Статус KYC</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <div className="flex items-center gap-2">
                {bootstrap?.onboarding.kycStatus === "APPROVED" ? (
                  <span className="flex items-center gap-1.5 text-xs text-positive">
                    <CheckCircle2 className="w-4 h-4" />
                    Подтверждено
                  </span>
                ) : bootstrap?.onboarding.kycStatus === "IN_REVIEW" ? (
                  <span className="flex items-center gap-1.5 text-xs text-warning">
                    <Clock className="w-4 h-4" />
                    На рассмотрении
                  </span>
                ) : (
                  <StatusBadge status="pending" />
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="divide-y divide-border">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Безопасность</h3>
          </div>
          <SettingsLink
            icon={<Shield className="w-5 h-5 text-muted-foreground" />}
            label="Центр безопасности"
            description="2FA, белый список и настройки безопасности"
            href="/settings/security"
            badge={
              isLoading ? (
                <Skeleton className="h-6 w-16" />
              ) : bootstrap?.security.twoFactorEnabled ? (
                <span className="text-xs text-positive flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Защищено
                </span>
              ) : (
                <span className="text-xs text-warning">Требуется настройка</span>
              )
            }
          />
        </Card>

        <Card className="divide-y divide-border">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Предпочтения</h3>
          </div>
          <SettingsLink
            icon={<Bell className="w-5 h-5 text-muted-foreground" />}
            label="Уведомления"
            description="Управление уведомлениями"
            href="/settings/notifications"
          />
        </Card>

        <Card className="divide-y divide-border">
          <div className="p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Поддержка</h3>
          </div>
          <SettingsLink
            icon={<HelpCircle className="w-5 h-5 text-muted-foreground" />}
            label="Помощь и поддержка"
            description="Получить помощь по аккаунту"
            href="/settings/support"
          />
        </Card>
      </div>
    </div>
  );
}
