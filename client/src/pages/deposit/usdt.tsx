import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AlertCircle, CheckCircle2, Loader2, Copy } from "lucide-react";
import { formatMoney, type BootstrapResponse } from "@shared/schema";

const FALLBACK_ADDRESS = "TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL";

export default function DepositUSDT() {
  const { toast } = useToast();
  const [simulateAmount, setSimulateAmount] = useState("");

  const { data: bootstrap } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const depositAddress = bootstrap?.config?.depositAddress || FALLBACK_ADDRESS;
  const minDeposit = bootstrap?.config?.minDeposit || "10000000";

  const simulateMutation = useMutation({
    mutationFn: async (amount: string) => {
      return apiRequest("POST", "/api/deposit/usdt/simulate", { amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Deposit simulated",
        description: "USDT has been credited to your wallet",
      });
      setSimulateAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "Deposit failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSimulate = () => {
    if (!simulateAmount) return;
    const amountInMinor = (parseFloat(simulateAmount) * 1000000).toString();
    simulateMutation.mutate(amountInMinor);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto">
      <PageHeader title="Deposit USDT" subtitle="TRC20 Network" backHref="/wallet" />

      <Card className="p-5 mb-6">
        <div className="mb-4">
          <h3 className="font-medium mb-2">Deposit Address</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Send USDT (TRC20) to the address below. Only send USDT on the TRON network.
          </p>
        </div>

        <div className="bg-muted rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between gap-2">
            <code className="text-sm font-mono break-all">{depositAddress}</code>
            <CopyButton value={depositAddress} />
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">Important</p>
            <ul className="text-muted-foreground mt-1 space-y-1 text-xs">
              <li>Only send USDT (TRC20) to this address</li>
              <li>Minimum deposit: {formatMoney(minDeposit, "USDT")} USDT</li>
              <li>Deposits typically confirm within 10 minutes</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4">
          <h3 className="font-medium mb-2">Simulate Deposit</h3>
          <p className="text-sm text-muted-foreground">
            For testing purposes, you can simulate a USDT deposit.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="simulate-amount">Amount (USDT)</Label>
            <Input
              id="simulate-amount"
              type="text"
              inputMode="decimal"
              placeholder="100.00"
              value={simulateAmount}
              onChange={(e) => setSimulateAmount(e.target.value)}
              className="mt-2"
              data-testid="input-simulate-amount"
            />
          </div>

          <Button
            className="w-full min-h-[44px]"
            onClick={handleSimulate}
            disabled={simulateMutation.isPending || !simulateAmount}
            data-testid="button-simulate-deposit"
          >
            {simulateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              "Simulate Deposit"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
