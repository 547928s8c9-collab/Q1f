import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatMoney, parseMoney, type Strategy, type BootstrapResponse } from "@shared/schema";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function InvestConfirm() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");

  const { data: strategy, isLoading: strategyLoading } = useQuery<Strategy>({
    queryKey: ["/api/strategies", params.id],
  });

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const investMutation = useMutation({
    mutationFn: async (data: { strategyId: string; amount: string }) => {
      return apiRequest("POST", "/api/invest", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Investment successful",
        description: `You've invested in ${strategy?.name}`,
      });
      setLocation("/invest");
    },
    onError: (error: Error) => {
      toast({
        title: "Investment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = strategyLoading || bootstrapLoading;
  const availableBalance = bootstrap?.balances.USDT.available || "0";
  const minInvestment = strategy?.minInvestment || "1000000";

  const amountInMinor = amount ? parseMoney(amount, "USDT") : "0";
  const isValidAmount = BigInt(amountInMinor) >= BigInt(minInvestment) && BigInt(amountInMinor) <= BigInt(availableBalance);
  const canInvest = bootstrap?.gate.canInvest && isValidAmount && !investMutation.isPending;

  const handleInvest = () => {
    if (!canInvest || !strategy) return;
    investMutation.mutate({
      strategyId: strategy.id,
      amount: amountInMinor,
    });
  };

  const handleMaxClick = () => {
    setAmount(formatMoney(availableBalance, "USDT"));
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto">
      <PageHeader
        title="Confirm Investment"
        backHref={`/invest/${params.id}`}
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <>
          <Card className="p-5 mb-6">
            <h3 className="font-semibold mb-2">{strategy?.name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{strategy?.description}</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expected Return</span>
              <span className="text-positive font-medium">
                +{strategy?.expectedMonthlyRangeBpsMin ? (strategy.expectedMonthlyRangeBpsMin / 100).toFixed(1) : "0"}% - 
                {strategy?.expectedMonthlyRangeBpsMax ? (strategy.expectedMonthlyRangeBpsMax / 100).toFixed(1) : "0"}%
              </span>
            </div>
          </Card>

          {!bootstrap?.gate.canInvest && (
            <Card className="p-4 mb-6 border-warning/50 bg-warning/5">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning">Investment Blocked</p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                    {bootstrap?.gate.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-5 mb-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="amount">Investment Amount</Label>
                  <button
                    onClick={handleMaxClick}
                    className="text-xs text-primary hover:underline"
                    data-testid="button-max"
                  >
                    Max: {formatMoney(availableBalance, "USDT")} USDT
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pr-16 text-right tabular-nums"
                    data-testid="input-amount"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    USDT
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Minimum: {formatMoney(minInvestment, "USDT")} USDT
                </p>
              </div>

              {amount && !isValidAmount && (
                <div className="flex items-center gap-2 text-sm text-negative">
                  <AlertCircle className="w-4 h-4" />
                  {BigInt(amountInMinor) < BigInt(minInvestment)
                    ? "Amount below minimum"
                    : "Insufficient balance"}
                </div>
              )}

              {amount && isValidAmount && (
                <div className="flex items-center gap-2 text-sm text-positive">
                  <CheckCircle2 className="w-4 h-4" />
                  Ready to invest
                </div>
              )}
            </div>
          </Card>

          <Button
            className="w-full min-h-[44px]"
            onClick={handleInvest}
            disabled={!canInvest}
            data-testid="button-confirm-invest"
          >
            {investMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Confirm Investment"
            )}
          </Button>
        </>
      )}
    </div>
  );
}
