import { useMemo } from "react";
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
import { DemoModeBanner } from "@/components/admin/demo-mode-banner";

interface OverviewData {
  usersTotal: number;
  usersActive: number;
  totalAUMMinor: string;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmountMinor: string;
  kycPendingCount: number;
}

type AdminUser = {
  id: string;
  name: string;
  email: string;
  status: "active" | "pending" | "blocked";
  balanceMinor: string;
  investedMinor: string;
  lastActive: string;
};

type AdminActivity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  amountMinor?: string;
};

type AdminInvestment = {
  id: string;
  strategy: string;
  user: string;
  amountMinor: string;
  status: "active" | "pending" | "completed";
};

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

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(items: T[]) {
  return items[randomInt(0, items.length - 1)];
}

function buildMinorAmount(min: number, max: number, decimals = 6) {
  const whole = randomInt(min, max);
  const fractional = randomInt(0, 99);
  return `${whole}${fractional.toString().padStart(decimals, "0")}`;
}

function generateAdminOverview() {
  const usersTotal = randomInt(1280, 5820);
  const usersActive = randomInt(420, 1180);
  const pendingWithdrawalsCount = randomInt(6, 38);
  const kycPendingCount = randomInt(4, 24);
  const pendingWithdrawalsAmountMinor = buildMinorAmount(45, 320);
  const totalAUMMinor = buildMinorAmount(2400, 9800);

  return {
    usersTotal,
    usersActive,
    totalAUMMinor,
    pendingWithdrawalsCount,
    pendingWithdrawalsAmountMinor,
    kycPendingCount,
  };
}

function generateUsers() {
  const names = [
    "Иван Петренко",
    "Мария Смирнова",
    "Alex Johnson",
    "Hannah Lee",
    "Кирилл Волков",
    "Дарья Белова",
    "Nina Berg",
    "Omar Haddad",
    "Sophie Martin",
    "Леонид Орлов",
  ];
  const statuses: AdminUser["status"][] = ["active", "pending", "blocked"];

  return Array.from({ length: 6 }, (_, index) => {
    const name = randomPick(names);
    const status = randomPick(statuses);
    const id = `user-${index}-${randomInt(100, 999)}`;
    const balanceMinor = buildMinorAmount(2, 320);
    const investedMinor = buildMinorAmount(12, 240);
    const lastActive = new Date(Date.now() - randomInt(2, 72) * 3600 * 1000).toLocaleString(
      "ru-RU",
      { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
    );

    return {
      id,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      status,
      balanceMinor,
      investedMinor,
      lastActive,
    };
  });
}

function generateActivities() {
  const actions = [
    { title: "Пополнение", detail: "USDT кошелек" },
    { title: "Вывод", detail: "Запрос на вывод" },
    { title: "Инвестиция", detail: "Strategy: BTC Squeeze Breakout" },
    { title: "KYC", detail: "Новый документ" },
    { title: "Перевод", detail: "Внутренний перевод" },
    { title: "Верификация", detail: "Обновление профиля" },
  ];

  return Array.from({ length: 7 }, (_, index) => {
    const action = randomPick(actions);
    const time = new Date(Date.now() - randomInt(10, 360) * 60000).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      id: `activity-${index}-${randomInt(100, 999)}`,
      title: action.title,
      detail: action.detail,
      time,
      amountMinor: buildMinorAmount(1, 90),
    };
  });
}

function generateInvestments() {
  const strategies = [
    "BTC Squeeze Breakout",
    "ETH EMA Revert",
    "BNB Trend Pullback",
    "SOL Volatility Burst",
    "XRP Keltner Revert",
    "DOGE Fast Momentum",
    "ADA Deep Revert",
    "TRX Low-Vol Band",
  ];
  const statuses: AdminInvestment["status"][] = ["active", "pending", "completed"];

  return Array.from({ length: 5 }, (_, index) => {
    const strategy = randomPick(strategies);
    return {
      id: `investment-${index}-${randomInt(100, 999)}`,
      strategy,
      user: randomPick(["Alex Johnson", "Мария Смирнова", "Nina Berg", "Иван Петренко", "Omar Haddad"]),
      amountMinor: buildMinorAmount(8, 160),
      status: randomPick(statuses),
    };
  });
}

interface AdminMeResponse {
  ok: boolean;
  data: {
    adminUserId: string;
    userId: string;
    email: string;
    roles: string[];
    permissions: string[];
    isDemo?: boolean;
  };
}

export default function AdminDashboard() {
  const { data: adminMeData } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/me"],
  });

  const { data, isLoading, error } = useQuery<{ ok: boolean; data: OverviewData }>({
    queryKey: ["/api/admin/overview"],
  });

  const generated = useMemo(
    () => ({
      overview: generateAdminOverview(),
      users: generateUsers(),
      activities: generateActivities(),
      investments: generateInvestments(),
    }),
    [],
  );

  const overview = data?.data ?? generated.overview;
  const isDemo = adminMeData?.data?.isDemo ?? false;

  return (
    <div className="p-6 space-y-6">
      <DemoModeBanner isDemo={isDemo} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" data-testid="text-admin-dashboard-title">Admin Dashboard</h1>
      </div>

      {error && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p>Сервер недоступен, отображаются демо-данные.</p>
          </div>
        </Card>
      )}

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Последние пользователи</h3>
            <Button variant="ghost" size="sm">
              Просмотреть всех
            </Button>
          </div>
          <div className="space-y-3">
            {generated.users.map((user) => (
              <div key={user.id} className="flex items-center justify-between border-b pb-3 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(user.balanceMinor)} USDT</p>
                  <p className="text-xs text-muted-foreground">
                    Инвестировано {formatMoney(user.investedMinor)} · {user.lastActive}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    user.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : user.status === "pending"
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-rose-500/10 text-rose-600"
                  }`}
                >
                  {user.status === "active" ? "Активен" : user.status === "pending" ? "На проверке" : "Заблокирован"}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Лента событий</h3>
          <div className="space-y-4">
            {generated.activities.map((activity) => (
              <div key={activity.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">{activity.detail}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(activity.amountMinor ?? "0")} USDT</p>
                  <p className="text-xs text-muted-foreground">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Инвестиции в работе</h3>
          <div className="space-y-3">
            {generated.investments.map((investment) => (
              <div key={investment.id} className="flex items-center justify-between border-b pb-3 last:border-b-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{investment.strategy}</p>
                  <p className="text-xs text-muted-foreground">{investment.user}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(investment.amountMinor)} USDT</p>
                  <p className="text-xs text-muted-foreground">
                    {investment.status === "active" && "Активна"}
                    {investment.status === "pending" && "Ожидает"}
                    {investment.status === "completed" && "Завершена"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Сводка действий</h3>
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Средний баланс</span>
              <span className="text-sm font-semibold">{formatMoney(buildMinorAmount(18, 40))} USDT</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Инвестиции за сутки</span>
              <span className="text-sm font-semibold">{formatMoney(buildMinorAmount(25, 88))} USDT</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Новые аккаунты</span>
              <span className="text-sm font-semibold">{randomInt(12, 54)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Активных сигналов</span>
              <span className="text-sm font-semibold">{randomInt(3, 14)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
