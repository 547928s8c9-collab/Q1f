import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CreditCard, Loader2, AlertCircle } from "lucide-react";

export default function DepositCard() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");

  const simulateMutation = useMutation({
    mutationFn: async (amountRub: string) => {
      return apiRequest("POST", "/api/deposit/card/simulate", { amount: amountRub });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Card deposit simulated",
        description: "RUB has been credited and converted to USDT",
      });
      setAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "Deposit failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeposit = () => {
    if (!amount) return;
    const amountInKopeks = (parseFloat(amount) * 100).toString();
    simulateMutation.mutate(amountInKopeks);
  };

  const estimatedUsdt = amount ? (parseFloat(amount) / 92.5).toFixed(2) : "0.00";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto">
      <PageHeader title="Card Deposit" subtitle="Top up with bank card" backHref="/wallet" />

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Bank Card Top-up</h3>
            <p className="text-sm text-muted-foreground">Instant conversion to USDT</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amount">Amount (RUB)</Label>
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
          </div>

          <div className="bg-muted rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">You'll receive (approx.)</span>
              <span className="font-medium tabular-nums">{estimatedUsdt} USDT</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-medium tabular-nums">1 USDT = 92.50 RUB</span>
            </div>
          </div>

          <Button
            className="w-full min-h-[44px]"
            onClick={handleDeposit}
            disabled={simulateMutation.isPending || !amount}
            data-testid="button-card-deposit"
          >
            {simulateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Simulate Card Deposit"
            )}
          </Button>
        </div>
      </Card>

      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
        <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <p>This is a demo simulation. In production, this would integrate with a payment provider for real card transactions.</p>
        </div>
      </div>
    </div>
  );
}
