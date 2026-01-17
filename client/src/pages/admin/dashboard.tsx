import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { 
  Users, 
  UserCheck, 
  Wallet, 
  Clock, 
  FileCheck, 
  ArrowRight,
  AlertCircle,
} from "lucide-react";

interface OverviewData {
  usersTotal: number;
  usersActive: number;
  totalAUMMinor: string;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmountMinor: string;
  kycPendingCount: number;
}

function formatMoney(minorUnits: string, decimals = 6): string {
  const value = BigInt(minorUnits);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fractional = value % divisor;
  const fractionalStr = fractional.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole.toLocaleString()}.${fractionalStr}`;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof Users;
  loading?: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-2xl font-semibold">{value}</p>
          )}
          {subtitle && !loading && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="p-3 bg-muted rounded-lg">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

function ActionCard({
  title,
  count,
  href,
  loading,
}: {
  title: string;
  count: number;
  href: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-2xl font-semibold">{count}</p>
          )}
        </div>
        <Link href={href}>
          <Button variant="outline" size="sm" data-testid={`link-${title.toLowerCase().replace(/\s+/g, "-")}`}>
            Перейти
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery<{ ok: boolean; data: OverviewData }>({
    queryKey: ["/api/admin/overview"],
  });

  const overview = data?.data;

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <Card className="p-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>Не удалось загрузить данные. Проверьте права доступа.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" data-testid="text-admin-dashboard-title">Admin Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Всего пользователей"
          value={overview?.usersTotal ?? 0}
          icon={Users}
          loading={isLoading}
        />
        <KpiCard
          title="Активных (30 дней)"
          value={overview?.usersActive ?? 0}
          icon={UserCheck}
          loading={isLoading}
        />
        <KpiCard
          title="AUM (USDT)"
          value={overview ? formatMoney(overview.totalAUMMinor) : "0.00"}
          icon={Wallet}
          loading={isLoading}
        />
        <KpiCard
          title="Ожидающие выводы"
          value={overview?.pendingWithdrawalsCount ?? 0}
          subtitle={overview ? `${formatMoney(overview.pendingWithdrawalsAmountMinor)} USDT` : undefined}
          icon={Clock}
          loading={isLoading}
        />
      </div>

      <h2 className="text-lg font-semibold pt-4">Требуют действия</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          title="KYC на рассмотрении"
          count={overview?.kycPendingCount ?? 0}
          href="/admin/kyc"
          loading={isLoading}
        />
        <ActionCard
          title="Выводы ожидают"
          count={overview?.pendingWithdrawalsCount ?? 0}
          href="/admin/withdrawals"
          loading={isLoading}
        />
      </div>
    </div>
  );
}
