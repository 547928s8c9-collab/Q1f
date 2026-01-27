import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatMoney, parseMoney, AddressStatus, type BootstrapResponse, type WhitelistAddress } from "@shared/schema";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NETWORK_FEE_MINOR = "1000000"; // 1 USDT fallback

export default function Withdraw() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [selectedWhitelist, setSelectedWhitelist] = useState<string>("");

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const { data: whitelist } = useQuery<WhitelistAddress[]>({
    queryKey: ["/api/security/whitelist"],
  });

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: string; address: string }) => {
      return apiRequest("POST", "/api/withdraw/usdt", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({
        title: "Withdrawal initiated",
        description: "Your withdrawal is being processed",
      });
      setAmount("");
      setAddress("");
      setSelectedWhitelist("");
    },
    onError: (error: Error) => {
      toast({
        title: "Withdrawal failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const availableBalance = bootstrap?.balances?.USDT?.available || "0";
  const amountInMinor = amount ? parseMoney(amount, "USDT") : "0";
  const isValidAmount = BigInt(amountInMinor) > BigInt(0) && BigInt(amountInMinor) <= BigInt(availableBalance);
  const finalAddress = selectedWhitelist || address;
  const canWithdraw = bootstrap?.gate.canWithdraw && isValidAmount && finalAddress.length > 30 && !withdrawMutation.isPending;

  const activeWhitelist = whitelist?.filter((w) => w.status === AddressStatus.ACTIVE) || [];
  const whitelistEnabled = bootstrap?.security.whitelistEnabled;

  const handleWithdraw = () => {
    if (!canWithdraw) return;
    withdrawMutation.mutate({ amount: amountInMinor, address: finalAddress });
  };

  const handleMaxClick = () => {
    setAmount(formatMoney(availableBalance, "USDT"));
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-lg mx-auto">
      <PageHeader title="Withdraw USDT" subtitle="TRC20 Network" backHref="/wallet" />

      {!bootstrap?.gate.canWithdraw && (
        <Card className="p-4 mb-6 border-warning/50 bg-warning/5">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Withdrawal Blocked</p>
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
              <Label htmlFor="amount">Amount</Label>
              <button
                onClick={handleMaxClick}
                className="text-xs text-primary hover:underline"
                data-testid="button-max-withdraw"
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
                data-testid="input-withdraw-amount"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                USDT
              </span>
            </div>
          </div>

          {whitelistEnabled && activeWhitelist.length > 0 ? (
            <div>
              <Label>Destination Address</Label>
              <Select value={selectedWhitelist} onValueChange={setSelectedWhitelist}>
                <SelectTrigger className="mt-2" data-testid="select-whitelist-address">
                  <SelectValue placeholder="Select whitelisted address" />
                </SelectTrigger>
                <SelectContent>
                  {activeWhitelist.map((addr) => (
                    <SelectItem key={addr.id} value={addr.address}>
                      <div className="flex flex-col">
                        <span className="font-medium">{addr.label || "Unlabeled"}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {addr.address}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Whitelist is enabled. You can only withdraw to approved addresses.
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="address">Destination Address (TRC20)</Label>
              <Input
                id="address"
                type="text"
                placeholder="T..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-2 font-mono text-sm"
                data-testid="input-withdraw-address"
              />
            </div>
          )}

          {amount && isValidAmount && finalAddress.length > 30 && (
            <div className="flex items-center gap-2 text-sm text-positive">
              <CheckCircle2 className="w-4 h-4" />
              Ready to withdraw
            </div>
          )}

          <div className="bg-muted rounded-lg p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network Fee</span>
              <span className="font-medium tabular-nums">~{formatMoney(bootstrap?.config?.networkFee || NETWORK_FEE_MINOR, "USDT")} USDT</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-medium tabular-nums">
                {amount ? (parseFloat(amount) - parseFloat(formatMoney(bootstrap?.config?.networkFee || NETWORK_FEE_MINOR, "USDT"))).toFixed(2) : "0.00"} USDT
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Button
        className="w-full min-h-[44px]"
        onClick={handleWithdraw}
        disabled={!canWithdraw}
        data-testid="button-confirm-withdraw"
      >
        {withdrawMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          "Confirm Withdrawal"
        )}
      </Button>
    </div>
  );
}
