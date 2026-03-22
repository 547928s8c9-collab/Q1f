import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Money } from "@/components/ui/money";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  RefreshCw, 
  CreditCard, 
  Shield, 
  Wallet,
  PiggyBank,
  Banknote,
  Settings,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Copy,
  AlertTriangle,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, getOperationCopy, type Operation } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface OperationDetailsSheetProps {
  operation: Operation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const iconMap: Record<string, LucideIcon> = {
  DEPOSIT_USDT: ArrowDownLeft,
  DEPOSIT_CARD: CreditCard,
  WITHDRAW_USDT: ArrowUpRight,
  INVEST: TrendingUp,
  DAILY_PAYOUT: TrendingUp,
  PROFIT_ACCRUAL: PiggyBank,
  PROFIT_PAYOUT: Banknote,
  PRINCIPAL_REDEEM_EXECUTED: ArrowDownLeft,
  PAYOUT_SETTINGS_CHANGED: Settings,
  FX: RefreshCw,
  SUBSCRIPTION: CreditCard,
  KYC: Shield,
  VAULT_TRANSFER: Wallet,
};

const iconColorMap: Record<string, string> = {
  DEPOSIT_USDT: "bg-success/10 text-success",
  DEPOSIT_CARD: "bg-success/10 text-success",
  WITHDRAW_USDT: "bg-danger/10 text-danger",
  INVEST: "bg-primary/10 text-primary",
  DAILY_PAYOUT: "bg-success/10 text-success",
  PROFIT_ACCRUAL: "bg-success/10 text-success",
  PROFIT_PAYOUT: "bg-success/10 text-success",
  PRINCIPAL_REDEEM_EXECUTED: "bg-success/10 text-success",
  PAYOUT_SETTINGS_CHANGED: "bg-primary/10 text-primary",
  FX: "bg-primary/10 text-primary",
  SUBSCRIPTION: "bg-muted text-muted-foreground",
  KYC: "bg-primary/10 text-primary",
  VAULT_TRANSFER: "bg-muted text-muted-foreground",
};

const statusConfig: Record<string, { icon: LucideIcon; variant: "default" | "success" | "warning" | "danger"; label: string }> = {
  pending: { icon: Clock, variant: "warning", label: "Ожидание" },
  processing: { icon: Loader2, variant: "warning", label: "Обработка" },
  completed: { icon: CheckCircle2, variant: "success", label: "Выполнен" },
  failed: { icon: XCircle, variant: "danger", label: "Ошибка" },
  cancelled: { icon: XCircle, variant: "default", label: "Отменён" },
};

function formatDetailDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleString("ru-RU", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function StatusTimeline({ operation }: { operation: Operation }) {
  const isFailed = operation.status === "failed";
  const isCancelled = operation.status === "cancelled";
  const isTerminalError = isFailed || isCancelled;

  const finalLabel = isFailed ? "Ошибка" : isCancelled ? "Отменён" : "Выполнен";

  const steps = [
    { status: "pending", label: "Запрос получен" },
    { status: "processing", label: "Обработка" },
    { status: "completed", label: finalLabel },
  ];

  const currentIndex = operation.status === "pending" ? 0 : 
                       operation.status === "processing" ? 1 : 2;

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const isPast = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === steps.length - 1;
        
        let icon: LucideIcon;
        let iconClass = "";
        
        if (isPast || (isCurrent && !isTerminalError && index === 2)) {
          icon = CheckCircle2;
          iconClass = "text-success";
        } else if (isCurrent && index < 2) {
          icon = Loader2;
          iconClass = "text-warning animate-spin";
        } else if (isCurrent && isTerminalError) {
          icon = XCircle;
          iconClass = "text-danger";
        } else {
          icon = Clock;
          iconClass = "text-muted-foreground";
        }
        
        const Icon = icon;

        return (
          <div key={step.status} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <Icon className={cn("w-5 h-5", iconClass)} />
              {!isLast && (
                <div className={cn(
                  "w-0.5 h-6 mt-1",
                  isPast ? "bg-success" : "bg-border"
                )} />
              )}
            </div>
            <div className="flex-1 pb-3">
              <p className={cn(
                "text-sm font-medium",
                (isPast || isCurrent) ? "text-foreground" : "text-muted-foreground"
              )}>
                {step.label}
              </p>
              {isCurrent && operation.createdAt && (
                <p className="text-xs text-muted-foreground">
                  {formatDetailDate(operation.createdAt)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-medium text-right", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

export function OperationDetailsSheet({ operation, open, onOpenChange }: OperationDetailsSheetProps) {
  const { toast } = useToast();

  if (!operation) return null;

  const Icon = iconMap[operation.type] || Wallet;
  const iconColor = iconColorMap[operation.type] || "bg-muted text-muted-foreground";
  const copy = getOperationCopy(operation.type, operation.status, { strategyName: operation.strategyName });
  const status = statusConfig[operation.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const isCredit = ["DEPOSIT_USDT", "DEPOSIT_CARD", "DAILY_PAYOUT", "PROFIT_PAYOUT", "PRINCIPAL_REDEEM_EXECUTED"].includes(operation.type);
  const isDebit = ["WITHDRAW_USDT", "INVEST", "SUBSCRIPTION"].includes(operation.type);

  const amount = operation.amount ? parseFloat(operation.amount) / 1000000 : 0;
  const fee = operation.fee ? parseFloat(operation.fee) / 1000000 : 0;
  const net = isDebit ? amount + fee : amount - fee;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(operation.id);
    toast({ title: "Ссылка скопирована" });
  };

  const handleReportProblem = () => {
    toast({ 
      title: "Жалоба отправлена",
      description: "Наша команда рассмотрит вашу проблему в ближайшее время."
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className={cn("w-14 h-14 rounded-full flex items-center justify-center", iconColor)}>
              <Icon className="w-7 h-7" />
            </div>
          </div>
          <SheetTitle className="text-xl">{copy.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
          
          {operation.amount && operation.asset && (
            <div className="pt-2">
              <Money 
                value={isDebit ? -amount : amount} 
                currency={operation.asset}
                size="2xl"
                showSign
                showCurrency
              />
            </div>
          )}

          <div className="flex justify-center pt-3">
            <Chip 
              variant={status.variant} 
              icon={<StatusIcon className={cn("w-3 h-3", status.variant === "warning" && "animate-spin")} />}
            >
              {status.label}
            </Chip>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Статус</h4>
            <StatusTimeline operation={operation} />
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Детализация</h4>
            <div className="space-y-1">
              <DetailRow 
                label="Сумма" 
                value={
                  <Money 
                    value={amount} 
                    currency={operation.asset || "USDT"} 
                    size="sm" 
                    showCurrency 
                  />
                } 
              />
              {fee > 0 && (
                <DetailRow 
                  label="Комиссия сети" 
                  value={
                    <Money 
                      value={-fee} 
                      currency={operation.asset || "USDT"} 
                      size="sm" 
                      variant="muted"
                      showCurrency 
                    />
                  } 
                />
              )}
              <Separator className="my-2" />
              <DetailRow 
                label={isDebit ? "Итого списано" : "Итого зачислено"} 
                value={
                  <Money 
                    value={net} 
                    currency={operation.asset || "USDT"} 
                    size="sm" 
                    variant={isCredit ? "positive" : isDebit ? "negative" : "default"}
                    showSign={isCredit || isDebit}
                    showCurrency 
                  />
                } 
              />
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Подробности</h4>
            <div className="space-y-1">
              <DetailRow label="Создан" value={formatDetailDate(operation.createdAt)} />
              {operation.updatedAt && operation.updatedAt !== operation.createdAt && (
                <DetailRow label="Обновлён" value={formatDetailDate(operation.updatedAt)} />
              )}
              {operation.strategyName && (
                <DetailRow label="Стратегия" value={operation.strategyName} />
              )}
              {operation.fromVault && (
                <DetailRow label="Откуда" value={operation.fromVault.charAt(0).toUpperCase() + operation.fromVault.slice(1)} />
              )}
              {operation.toVault && (
                <DetailRow label="Куда" value={operation.toVault.charAt(0).toUpperCase() + operation.toVault.slice(1)} />
              )}
              {operation.txHash && (
                <DetailRow label="TX Hash" value={operation.txHash.slice(0, 16) + "..."} mono />
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Ссылка</span>
                <button 
                  onClick={handleCopyRef}
                  className="flex items-center gap-1.5 text-sm font-mono text-xs hover-elevate px-2 py-1 rounded"
                  data-testid="button-copy-ref"
                >
                  {operation.id.slice(0, 8)}...
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>

          <Separator />

          <Button 
            variant="outline" 
            className="w-full" 
            onClick={handleReportProblem}
            data-testid="button-report-problem"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Сообщить о проблеме
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
