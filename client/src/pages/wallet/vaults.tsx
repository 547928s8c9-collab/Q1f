import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { VaultCard } from "@/components/vault/vault-card";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type BootstrapResponse } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, parseMoney } from "@shared/schema";

type VaultType = "principal" | "profit" | "taxes";
type TransferDirection = "in" | "out";

export default function Vaults() {
  const { toast } = useToast();
  const [transferDialog, setTransferDialog] = useState<{
    open: boolean;
    vault: VaultType;
    direction: TransferDirection;
  }>({ open: false, vault: "principal", direction: "in" });
  const [amount, setAmount] = useState("");

  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const transferMutation = useMutation({
    mutationFn: async (data: { fromVault: string; toVault: string; amount: string }) => {
      return apiRequest("POST", "/api/vault/transfer", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Transfer successful" });
      setTransferDialog({ ...transferDialog, open: false });
      setAmount("");
    },
    onError: (error: Error) => {
      toast({ title: "Transfer failed", description: error.message, variant: "destructive" });
    },
  });

  const autoSweepMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/security/auto-sweep", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Auto-sweep updated" });
    },
  });

  const handleTransfer = () => {
    const { vault, direction } = transferDialog;
    const amountInMinor = parseMoney(amount, "USDT");

    let fromVault: string;
    let toVault: string;

    if (direction === "in") {
      fromVault = "wallet";
      toVault = vault;
    } else {
      fromVault = vault;
      toVault = "wallet";
    }

    transferMutation.mutate({ fromVault, toVault, amount: amountInMinor });
  };

  const openTransferDialog = (vault: VaultType, direction: TransferDirection) => {
    setTransferDialog({ open: true, vault, direction });
    setAmount("");
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Vaults" subtitle="Secure storage for your capital" backHref="/wallet" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </>
        ) : (
          <>
            <VaultCard
              type="principal"
              balance={bootstrap?.vaults.principal || "0"}
              asset="USDT"
              onTransferIn={() => openTransferDialog("principal", "in")}
              onTransferOut={() => openTransferDialog("principal", "out")}
            />
            <VaultCard
              type="profit"
              balance={bootstrap?.vaults.profit || "0"}
              asset="USDT"
              onTransferIn={() => openTransferDialog("profit", "in")}
              onTransferOut={() => openTransferDialog("profit", "out")}
            />
            <VaultCard
              type="taxes"
              balance={bootstrap?.vaults.taxes || "0"}
              asset="USDT"
              onTransferIn={() => openTransferDialog("taxes", "in")}
              onTransferOut={() => openTransferDialog("taxes", "out")}
            />
          </>
        )}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Auto-Sweep</h3>
            <p className="text-sm text-muted-foreground">
              Automatically move daily payout profits to Profit Vault
            </p>
          </div>
          <Switch
            checked={bootstrap?.security.autoSweepEnabled || false}
            onCheckedChange={(checked) => autoSweepMutation.mutate(checked)}
            disabled={autoSweepMutation.isPending}
            data-testid="toggle-auto-sweep"
          />
        </div>
      </Card>

      <Dialog open={transferDialog.open} onOpenChange={(open) => setTransferDialog({ ...transferDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {transferDialog.direction === "in" ? "Transfer to" : "Transfer from"} {transferDialog.vault.charAt(0).toUpperCase() + transferDialog.vault.slice(1)} Vault
            </DialogTitle>
            <DialogDescription>
              {transferDialog.direction === "in"
                ? "Move USDT from your wallet to this vault"
                : "Withdraw USDT from this vault to your wallet"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="transfer-amount">Amount (USDT)</Label>
              <Input
                id="transfer-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-2"
                data-testid="input-transfer-amount"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleTransfer}
              disabled={transferMutation.isPending || !amount}
              data-testid="button-confirm-transfer"
            >
              {transferMutation.isPending ? "Processing..." : "Confirm Transfer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
