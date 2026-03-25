import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { type BootstrapResponse, formatMoney } from "@shared/schema";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  Bell,
  LogOut,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KYC_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  APPROVED: { label: "Подтверждено", color: "text-positive", icon: CheckCircle2 },
  IN_REVIEW: { label: "На рассмотрении", color: "text-warning", icon: Clock },
  NOT_STARTED: { label: "Не пройдена", color: "text-muted-foreground", icon: AlertCircle },
  PENDING: { label: "Ожидает", color: "text-warning", icon: Clock },
  NEEDS_ACTION: { label: "Требуется действие", color: "text-danger", icon: AlertCircle },
  REJECTED: { label: "Отклонено", color: "text-danger", icon: AlertCircle },
  ON_HOLD: { label: "Приостановлено", color: "text-warning", icon: Clock },
};

interface Operation {
  id: string;
  type: string;
  status: string;
  amountMinor: string;
  currency: string;
  createdAt: string;
}

const OP_TYPE_LABELS: Record<string, { label: string; icon: typeof ArrowDownLeft; color: string }> = {
  DEPOSIT_USDT: { label: "Пополнение USDT", icon: ArrowDownLeft, color: "text-positive" },
  DEPOSIT_CARD: { label: "Пополнение картой", icon: ArrowDownLeft, color: "text-positive" },
  WITHDRAW_USDT: { label: "Вывод USDT", icon: ArrowUpRight, color: "text-warning" },
  INVEST: { label: "Инвестиция", icon: TrendingUp, color: "text-primary" },
  STRATEGY_CONNECT: { label: "Подключение стратегии", icon: TrendingUp, color: "text-primary" },
  STRATEGY_DISCONNECT: { label: "Отключение стратегии", icon: TrendingUp, color: "text-muted-foreground" },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  processing: "Обрабатывается",
  completed: "Выполнено",
  failed: "Ошибка",
  cancelled: "Отменено",
};

export default function ProfilePage() {
  useSetPageTitle("Профиль");
  const { user, logout } = useAuth();

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: operationsData, isLoading: opsLoading } = useQuery<{ operations: Operation[] }>({
    queryKey: ["/api/operations", { limit: 10 }],
    queryFn: async () => {
      const res = await fetch("/api/operations?limit=10", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch operations");
      return res.json();
    },
  });

  const initials = user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U";
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email?.split("@")[0] || "Пользователь";
  const kycStatus = bootstrap?.onboarding?.kycStatus || "NOT_STARTED";
  const kycInfo = KYC_LABELS[kycStatus] || KYC_LABELS.NOT_STARTED;
  const KycIcon = kycInfo.icon;
  const operations = operationsData?.operations || [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-5 pb-24">
      {/* User card */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {bootstrapLoading ? (
              <>
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-4 w-48" />
              </>
            ) : (
              <>
                <p className="text-base font-semibold truncate">{displayName}</p>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* KYC Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Верификация (KYC)</p>
              {bootstrapLoading ? (
                <Skeleton className="h-4 w-24 mt-0.5" />
              ) : (
                <p className={cn("text-xs font-medium flex items-center gap-1", kycInfo.color)}>
                  <KycIcon className="w-3.5 h-3.5" />
                  {kycInfo.label}
                </p>
              )}
            </div>
          </div>
          <Link href="/settings/security">
            <Button variant="ghost" size="icon">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </Button>
          </Link>
        </div>
      </Card>

      {/* User data */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Данные аккаунта</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Имя</span>
            {bootstrapLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <span className="font-medium">{bootstrap?.user?.firstName || "—"}</span>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Фамилия</span>
            {bootstrapLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <span className="font-medium">{bootstrap?.user?.lastName || "—"}</span>
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            {bootstrapLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span className="font-medium truncate ml-4">{bootstrap?.user?.email || "—"}</span>
            )}
          </div>
        </div>
      </Card>

      {/* Operations */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Последние операции</h3>
        {opsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : operations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Нет операций
          </p>
        ) : (
          <div className="space-y-2">
            {operations.map((op) => {
              const opMeta = OP_TYPE_LABELS[op.type] || { label: op.type, icon: User, color: "text-muted-foreground" };
              const OpIcon = opMeta.icon;
              return (
                <Link key={op.id} href={`/activity/${op.id}`}>
                  <div className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center bg-muted/60", opMeta.color)}>
                        <OpIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{opMeta.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(op.createdAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}
                          {STATUS_LABELS[op.status] || op.status}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {formatMoney(op.amountMinor, op.currency as "USDT" | "RUB")} {op.currency}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* Settings */}
      <Card className="divide-y divide-border">
        <Link href="/settings/notifications">
          <div className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium flex-1">Уведомления</span>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </Link>
        <div className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-muted-foreground text-sm">🌙</span>
          </div>
          <span className="text-sm font-medium flex-1">Тёмная тема</span>
          <ThemeToggle />
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center gap-4 p-4 w-full text-left cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0">
            <LogOut className="w-5 h-5 text-danger" />
          </div>
          <span className="text-sm font-medium text-danger">Выйти</span>
        </button>
      </Card>
    </div>
  );
}
