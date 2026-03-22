import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CreditCard, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { BootstrapResponse } from "@shared/schema";
import { getMoneyInputState } from "@/lib/moneyInput";
import { createIdempotencyKey } from "@/lib/idempotency";

export default function DepositCard() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [moonpayAmount, setMoonpayAmount] = useState("");
  const [onramperOpen, setOnramperOpen] = useState(false);

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const usdtRubRate = parseFloat(bootstrap?.quotes["USDT/RUB"]?.price || "92.5");

  const simulateMutation = useMutation({
    mutationFn: async (amountRub: string) => {
      return apiRequest(
        "POST",
        "/api/deposit/card/simulate",
        { amount: amountRub },
        { headers: { "Idempotency-Key": createIdempotencyKey("dep_card") } },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Пополнение картой смоделировано",
        description: "RUB зачислен и конвертирован в USDT",
      });
      setAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка пополнения",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { normalized: normalizedAmount, minor: amountInKopeks, error: amountError } =
    getMoneyInputState(amount, "RUB");

  const handleDeposit = () => {
    if (!amountInKopeks) return;
    simulateMutation.mutate(amountInKopeks);
  };

  const estimatedUsdt = amountInKopeks
    ? (Number(amountInKopeks) / 100 / usdtRubRate).toFixed(2)
    : "0.00";

  const moonpayAmountNum = parseFloat(moonpayAmount) || 0;
  const moonpayFee = moonpayAmountNum * 0.025;
  const moonpayTotal = moonpayAmountNum + moonpayFee;

  const handleMoonpayOpen = () => {
    const apiKey = import.meta.env.VITE_MOONPAY_API_KEY ?? "";
    if (!apiKey || !Number.isFinite(moonpayAmountNum) || moonpayAmountNum < 20) return;
    const url = new URL("https://buy.moonpay.com");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("currencyCode", "usdt_trc20");
    url.searchParams.set("baseCurrencyAmount", String(moonpayAmountNum));
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto">
      <PageHeader title="Карта → USDT" subtitle="Пополнение банковской картой" backHref="/wallet" />

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Карта → USDT</h3>
            <p className="text-sm text-muted-foreground">Мгновенная конвертация в USDT</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Сумма (RUB)</Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              placeholder="10,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2"
              data-testid="input-card-amount"
            />
            {amountError && <p className="text-xs text-destructive mt-2">{amountError}</p>}
          </div>

          <div className="bg-muted rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Вы получите (прибл.)</span>
              <span className="font-medium tabular-nums">{estimatedUsdt} USDT</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">Курс</span>
              <span className="font-medium tabular-nums">1 USDT = {usdtRubRate.toFixed(2)} RUB</span>
            </div>
          </div>

          <Button
            className="w-full min-h-[44px]"
            onClick={handleDeposit}
            disabled={simulateMutation.isPending || !normalizedAmount || !!amountError}
            data-testid="button-card-deposit"
          >
            {simulateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Обработка...
              </>
            ) : (
              "Симуляция пополнения картой"
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-5 mb-6">
        <h3 className="font-medium mb-4">Оплата картой через MoonPay</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="moonpay-amount">Сумма в USDT</Label>
            <Input
              id="moonpay-amount"
              type="number"
              inputMode="decimal"
              placeholder="100"
              min={20}
              max={1000}
              value={moonpayAmount}
              onChange={(e) => setMoonpayAmount(e.target.value)}
              className="mt-2"
              data-testid="input-moonpay-amount"
            />
          </div>
          {moonpayAmountNum > 0 && (
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Комиссия MoonPay: ~2.5%</span>
                <span className="tabular-nums">${moonpayFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Итого к оплате:</span>
                <span className="tabular-nums">${moonpayTotal.toFixed(2)} USD</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold text-blue-700 border-blue-300 bg-blue-50">VISA</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold text-orange-600 border-orange-300 bg-orange-50">MC</span>
          </div>
          <Button
            className="w-full min-h-[44px]"
            onClick={handleMoonpayOpen}
            disabled={moonpayAmountNum < 20 || moonpayAmountNum > 1000}
            data-testid="button-moonpay-pay"
          >
            Перейти к оплате →
          </Button>
        </div>
      </Card>

      <Card className="p-5 mb-6">
        <button
          className="flex items-center justify-between w-full text-left text-sm font-medium"
          onClick={() => setOnramperOpen((v) => !v)}
          data-testid="button-onramper-toggle"
        >
          <span>Карта не проходит? Альтернативные способы →</span>
          {onramperOpen
            ? <ChevronUp className="w-4 h-4 flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
        </button>
        {onramperOpen && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Если MoonPay не принимает вашу карту, свяжитесь с нами
              в Telegram — поможем пополнить через локального партнёра.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open("https://t.me/your_support", "_blank", "noopener,noreferrer")}
              data-testid="button-telegram-support"
            >
              Написать в поддержку
            </Button>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
        <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p>Это симуляция пополнения. В продакшн карточные платежи обрабатываются через платёжный шлюз.</p>
        </div>
      </div>
    </div>
  );
}
