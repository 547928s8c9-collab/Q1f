import { useState, useMemo } from "react";
import { DemoModeBanner } from "@/components/admin/demo-mode-banner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Wallet,
  Play,
  Check,
  X,
  RefreshCw,
  Copy,
} from "lucide-react";
import { Link } from "wouter";
import type { AdminWithdrawalListItem, AdminWithdrawalDetail } from "@shared/admin/dto";

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

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "bg-warning/10 text-warning",
  PENDING_APPROVAL: "bg-accent/10 text-accent-foreground",
  PENDING: "bg-warning/10 text-warning",
  APPROVED: "bg-positive/10 text-positive",
  PROCESSING: "bg-primary/10 text-primary",
  COMPLETED: "bg-positive/10 text-positive",
  FAILED: "bg-destructive/10 text-destructive",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  PENDING_REVIEW: Clock,
  PENDING_APPROVAL: AlertTriangle,
  PENDING: Clock,
  APPROVED: CheckCircle,
  PROCESSING: RefreshCw,
  COMPLETED: Check,
  FAILED: XCircle,
  REJECTED: XCircle,
  CANCELLED: X,
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "На проверке",
  PENDING_APPROVAL: "Ожидает одобрения",
  PENDING: "В ожидании",
  APPROVED: "Одобрено",
  PROCESSING: "Обработка",
  COMPLETED: "Завершено",
  FAILED: "Ошибка",
  REJECTED: "Отклонено",
  CANCELLED: "Отменено",
};

type ActionType = "REVIEW" | "REQUEST_APPROVAL" | "APPROVE" | "REJECT" | "MARK_PROCESSING" | "MARK_COMPLETED" | "MARK_FAILED";

function formatAmount(amountMinor: string, currency: string): string {
  const decimals = currency === "USDT" ? 6 : 2;
  const amount = Number(amountMinor) / Math.pow(10, decimals);
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: decimals })} ${currency}`;
}

export default function AdminWithdrawals() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: ActionType | null }>({ open: false, action: null });
  const [actionReason, setActionReason] = useState("");
  const [txHash, setTxHash] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const { data: adminMeData } = useQuery<AdminMeResponse>({
    queryKey: ["/api/admin/me"],
  });
  const isDemo = adminMeData?.data?.isDemo ?? false;

  const permissions = useMemo(() => {
    const perms = new Set(adminMeData?.data?.permissions || []);
    return {
      canApprove: perms.has("withdrawals.approve"),
      canManage: perms.has("withdrawals.manage"),
    };
  }, [adminMeData]);

  const { data: withdrawalsData, isLoading } = useQuery<{ ok: boolean; data: AdminWithdrawalListItem[]; meta?: { nextCursor: string | null } }>({
    queryKey: ["/api/admin/withdrawals", { status: statusFilter === "all" ? undefined : statusFilter }],
  });

  const { data: detailData, isLoading: detailLoading } = useQuery<{ ok: boolean; data: AdminWithdrawalDetail }>({
    queryKey: ["/api/admin/withdrawals", selectedWithdrawalId],
    enabled: !!selectedWithdrawalId,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ withdrawalId }: { withdrawalId: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Проверка завершена", description: "Вывод ожидает одобрения другого администратора" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Не удалось проверить вывод", 
        description: error.message || "Что-то пошло не так",
        variant: "destructive",
      });
    },
  });

  const requestApprovalMutation = useMutation({
    mutationFn: async ({ withdrawalId }: { withdrawalId: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/request-approval`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Запрос на одобрение отправлен", description: "Ожидается одобрение другого администратора" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Не удалось запросить одобрение", 
        description: error.message || "Что-то пошло не так",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ pendingActionId }: { pendingActionId: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/pending-actions/${pendingActionId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Вывод одобрен", description: "Вывод одобрен для обработки" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
    },
    onError: (error: any) => {
      toast({ 
        title: "Не удалось одобрить вывод", 
        description: error.message || "Что-то пошло не так",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ withdrawalId, reason }: { withdrawalId: string; reason: string }) => {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ action: "REJECT", reason }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Вывод отклонён", description: "Запрос на вывод был отклонён" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
      setActionReason("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Не удалось отклонить вывод", 
        description: error.message || "Что-то пошло не так",
        variant: "destructive",
      });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ withdrawalId, action, reason, txHash, error }: { 
      withdrawalId: string; 
      action: "MARK_PROCESSING" | "MARK_COMPLETED" | "MARK_FAILED";
      reason: string;
      txHash?: string;
      error?: string;
    }) => {
      const idempotencyKey = crypto.randomUUID();
      const body: any = { action, reason };
      if (txHash) body.txHash = txHash;
      if (error) body.error = error;
      
      const res = await fetch(`/api/admin/withdrawals/${withdrawalId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Request failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const messages: Record<string, string> = {
        PROCESSING: "Вывод обрабатывается",
        COMPLETED: "Вывод успешно завершён",
        FAILED: "Вывод отмечен как неудачный",
      };
      toast({ title: "Статус обновлён", description: messages[data.data?.status] || "Статус обновлён" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/withdrawals"] });
      setActionDialog({ open: false, action: null });
      setActionReason("");
      setTxHash("");
      setErrorMessage("");
    },
    onError: (error: any) => {
      toast({ 
        title: "Не удалось обновить статус", 
        description: error.message || "Что-то пошло не так",
        variant: "destructive",
      });
    },
  });

  const withdrawals = withdrawalsData?.data || [];
  const detail = detailData?.data;

  const filteredWithdrawals = withdrawals.filter((w) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return w.email?.toLowerCase().includes(q) || w.userId.toLowerCase().includes(q) || w.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleActionClick = (action: ActionType) => {
    setActionDialog({ open: true, action });
  };

  const handleConfirmAction = () => {
    if (!selectedWithdrawalId) return;
    
    switch (actionDialog.action) {
      case "REVIEW":
        reviewMutation.mutate({ withdrawalId: selectedWithdrawalId });
        break;
      case "REQUEST_APPROVAL":
        requestApprovalMutation.mutate({ withdrawalId: selectedWithdrawalId });
        break;
      case "APPROVE":
        if (detail?.pendingAction) {
          approveMutation.mutate({ pendingActionId: detail.pendingAction.id });
        }
        break;
      case "REJECT":
        if (!actionReason.trim()) return;
        rejectMutation.mutate({ withdrawalId: selectedWithdrawalId, reason: actionReason.trim() });
        break;
      case "MARK_PROCESSING":
        if (!actionReason.trim()) return;
        processMutation.mutate({ 
          withdrawalId: selectedWithdrawalId, 
          action: "MARK_PROCESSING",
          reason: actionReason.trim()
        });
        break;
      case "MARK_COMPLETED":
        if (!actionReason.trim()) return;
        processMutation.mutate({ 
          withdrawalId: selectedWithdrawalId, 
          action: "MARK_COMPLETED",
          reason: actionReason.trim(),
          txHash: txHash.trim() || undefined
        });
        break;
      case "MARK_FAILED":
        if (!actionReason.trim()) return;
        processMutation.mutate({ 
          withdrawalId: selectedWithdrawalId, 
          action: "MARK_FAILED",
          reason: actionReason.trim(),
          error: errorMessage.trim() || undefined
        });
        break;
    }
  };

  const isPending = reviewMutation.isPending || requestApprovalMutation.isPending || 
                    approveMutation.isPending || rejectMutation.isPending || processMutation.isPending;

  const needsReason = actionDialog.action && ["REJECT", "MARK_PROCESSING", "MARK_COMPLETED", "MARK_FAILED"].includes(actionDialog.action);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Скопировано", description: "Адрес скопирован в буфер обмена" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-home">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Очередь выводов</h1>
            </div>
          </div>
          <Badge variant="outline">Консоль администратора</Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <DemoModeBanner isDemo={isDemo} />
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по email, ID пользователя или ID вывода..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Фильтр по статусу" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="PENDING">Ожидает</SelectItem>
              <SelectItem value="APPROVED">Одобрен</SelectItem>
              <SelectItem value="PROCESSING">В обработке</SelectItem>
              <SelectItem value="COMPLETED">Завершён</SelectItem>
              <SelectItem value="FAILED">Неудача</SelectItem>
              <SelectItem value="REJECTED">Отклонён</SelectItem>
              <SelectItem value="CANCELLED">Отменён</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Заявки на вывод не найдены</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredWithdrawals.map((withdrawal) => {
              const StatusIcon = STATUS_ICONS[withdrawal.status] || Clock;
              return (
                <Card
                  key={withdrawal.id}
                  className="p-4 hover-elevate cursor-pointer"
                  onClick={() => setSelectedWithdrawalId(withdrawal.id)}
                  data-testid={`card-withdrawal-${withdrawal.id}`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${STATUS_COLORS[withdrawal.status] || "bg-muted"}`}>
                        <StatusIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium" data-testid="text-withdrawal-amount">
                          {formatAmount(withdrawal.amountMinor, withdrawal.currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {withdrawal.email || withdrawal.userId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-right">
                        <p className="text-sm font-mono text-muted-foreground">{withdrawal.addressShort}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(withdrawal.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={STATUS_COLORS[withdrawal.status]} data-testid="badge-status">
                        {STATUS_LABELS[withdrawal.status] || withdrawal.status}
                      </Badge>
                      {withdrawal.riskScore !== null && withdrawal.riskScore > 50 && (
                        <Badge variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Риск: {withdrawal.riskScore}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Sheet open={!!selectedWithdrawalId} onOpenChange={(open) => !open && setSelectedWithdrawalId(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Детали вывода</SheetTitle>
          </SheetHeader>
          
          {detailLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Сумма</h3>
                <Card className="p-4">
                  <div className="text-2xl font-bold" data-testid="text-detail-amount">
                    {formatAmount(detail.amountMinor, detail.currency)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Комиссия: {formatAmount(detail.feeMinor, detail.currency)}
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Адрес назначения</h3>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs break-all" data-testid="text-detail-address">{detail.address}</code>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(detail.address)} data-testid="button-copy-address">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Пользователь</h3>
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Эл. почта</span>
                    <span className="font-medium" data-testid="text-detail-email">{detail.email || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Имя</span>
                    <span className="font-medium">
                      {detail.user?.firstName} {detail.user?.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">ID пользователя</span>
                    <span className="font-mono text-xs">{detail.userId}</span>
                  </div>
                </Card>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Статус</h3>
                <Card className="p-4 space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Статус</span>
                    <Badge className={STATUS_COLORS[detail.status]} data-testid="text-detail-status">
                      {STATUS_LABELS[detail.status] || detail.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Создано</span>
                    <span className="font-medium">
                      {new Date(detail.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {detail.approvedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Одобрено</span>
                      <span className="font-medium">
                        {new Date(detail.approvedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {detail.processedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Обработано</span>
                      <span className="font-medium">
                        {new Date(detail.processedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {detail.completedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Завершено</span>
                      <span className="font-medium">
                        {new Date(detail.completedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {detail.txHash && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground">Хеш TX</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">{detail.txHash.slice(0, 10)}...</span>
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(detail.txHash!)} data-testid="button-copy-txhash">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {detail.pendingAction && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Ожидает одобрения</h3>
                  <Card className="p-4 border-warning/50 bg-warning/5">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-warning" />
                      <span className="font-medium text-warning">Ожидание одобрения по принципу 4-х глаз</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Запрошено другим администратором. Другой администратор должен одобрить этот вывод.
                    </p>
                  </Card>
                </div>
              )}

              {(detail.rejectionReason || detail.lastError) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Примечания</h3>
                  <Card className="p-4">
                    {detail.rejectionReason && (
                      <div className="text-destructive">
                        <span className="font-medium">Причина отклонения: </span>
                        {detail.rejectionReason}
                      </div>
                    )}
                    {detail.lastError && (
                      <div className="text-destructive mt-2">
                        <span className="font-medium">Ошибка: </span>
                        {detail.lastError}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {detail.riskFlags && detail.riskFlags.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Флаги рисков</h3>
                  <Card className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {detail.riskFlags.map((flag, i) => (
                        <Badge key={i} variant="outline" className="text-warning border-warning">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              {(permissions.canApprove || permissions.canManage) && detail.allowedTransitions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Действия</h3>
                  <div className="flex flex-wrap gap-2">
                    {permissions.canApprove && (detail.status === "PENDING_REVIEW" || detail.status === "PENDING") && !detail.reviewedByAdminId && (
                      <Button 
                        onClick={() => handleActionClick("REVIEW")} 
                        data-testid="button-review"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Проверить
                      </Button>
                    )}
                    {permissions.canApprove && (detail.status === "PENDING_APPROVAL" || detail.status === "PENDING") && !detail.pendingAction && detail.reviewedByAdminId && (
                      <Button 
                        onClick={() => handleActionClick("REQUEST_APPROVAL")} 
                        data-testid="button-request-approval"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Запросить одобрение
                      </Button>
                    )}
                    {permissions.canApprove && detail.pendingAction && (detail.status === "PENDING_APPROVAL" || detail.status === "PENDING") && (
                      <Button 
                        onClick={() => handleActionClick("APPROVE")} 
                        data-testid="button-approve"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Одобрить (4 глаза)
                      </Button>
                    )}
                    {permissions.canApprove && detail.allowedTransitions.includes("REJECTED") && (
                      <Button 
                        variant="destructive"
                        onClick={() => handleActionClick("REJECT")}
                        data-testid="button-reject"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Отклонить
                      </Button>
                    )}
                    {permissions.canManage && detail.allowedTransitions.includes("PROCESSING") && (
                      <Button 
                        onClick={() => handleActionClick("MARK_PROCESSING")}
                        data-testid="button-mark-processing"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        В обработку
                      </Button>
                    )}
                    {permissions.canManage && detail.allowedTransitions.includes("COMPLETED") && (
                      <Button 
                        onClick={() => handleActionClick("MARK_COMPLETED")}
                        data-testid="button-mark-completed"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Завершить
                      </Button>
                    )}
                    {permissions.canManage && detail.allowedTransitions.includes("FAILED") && (
                      <Button 
                        variant="destructive"
                        onClick={() => handleActionClick("MARK_FAILED")}
                        data-testid="button-mark-failed"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Отметить неудачу
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, action: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "REVIEW" && "Проверка вывода"}
              {actionDialog.action === "REQUEST_APPROVAL" && "Запрос одобрения"}
              {actionDialog.action === "APPROVE" && "Одобрение вывода"}
              {actionDialog.action === "REJECT" && "Отклонение вывода"}
              {actionDialog.action === "MARK_PROCESSING" && "Отметить как обрабатываемый"}
              {actionDialog.action === "MARK_COMPLETED" && "Отметить как завершённый"}
              {actionDialog.action === "MARK_FAILED" && "Отметить как неудачный"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.action === "REVIEW" && "Вывод будет отмечен как проверенный. Другой администратор должен затем одобрить его (принцип 4-х глаз)."}
              {actionDialog.action === "REQUEST_APPROVAL" && "Будет создан запрос на одобрение, который должен быть одобрен другим администратором (принцип 4-х глаз)."}
              {actionDialog.action === "APPROVE" && "Вы одобряете этот вывод как второй проверяющий. Вывод будет готов к обработке."}
              {actionDialog.action === "REJECT" && "Запрос на вывод будет отклонён. Укажите причину."}
              {actionDialog.action === "MARK_PROCESSING" && "Вывод будет отмечен как обрабатываемый. Это означает, что транзакция отправляется в блокчейн."}
              {actionDialog.action === "MARK_COMPLETED" && "Вывод будет отмечен как завершённый. Вы можете указать хеш транзакции."}
              {actionDialog.action === "MARK_FAILED" && "Вывод будет отмечен как неудачный. Укажите детали ошибки."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {needsReason && (
              <Textarea
                placeholder="Введите причину этого действия..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                data-testid="textarea-reason"
              />
            )}
            {actionDialog.action === "MARK_COMPLETED" && (
              <Input
                placeholder="Хеш транзакции (необязательно)"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                data-testid="input-txhash"
              />
            )}
            {actionDialog.action === "MARK_FAILED" && (
              <Input
                placeholder="Сообщение об ошибке (необязательно)"
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                data-testid="input-error"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, action: null })}>
              Отмена
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={isPending || (!!needsReason && !actionReason.trim())}
              data-testid="button-confirm-action"
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
