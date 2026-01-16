import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { VaultCard } from "@/components/vault/vault-card";
import { Skeleton } from "@/components/ui/loading-skeleton";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type BootstrapResponse, type VaultData, formatMoney, parseMoney } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VaultType = "principal" | "profit" | "taxes";
type TransferDirection = "in" | "out";

const defaultVaultData: VaultData = {
  balance: "0",
  goalName: null,
  goalAmount: null,
  autoSweepPct: 0,
  autoSweepEnabled: false,
  progress: 0,
};

export default function Vaults() {
  const { toast } = useToast();
  const [transferDialog, setTransferDialog] = useState<{
    open: boolean;
    vault: VaultType;
    direction: TransferDirection;
  }>({ open: false, vault: "principal", direction: "in" });
  const [goalDialog, setGoalDialog] = useState<{
    open: boolean;
    vault: VaultType;
    data: VaultData;
  }>({ open: false, vault: "principal", data: defaultVaultData });
  const [amount, setAmount] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [autoSweepPct, setAutoSweepPct] = useState(0);
  const [autoSweepEnabled, setAutoSweepEnabled] = useState(false);

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

  const goalMutation = useMutation({
    mutationFn: async (data: { 
      type: VaultType; 
      goalName: string | null; 
      goalAmount: string | null;
      autoSweepPct: number;
      autoSweepEnabled: boolean;
    }) => {
      return apiRequest("POST", "/api/vault/goal", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
      toast({ title: "Goal updated" });
      setGoalDialog({ ...goalDialog, open: false });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
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

  const handleSaveGoal = () => {
    const { vault } = goalDialog;
    goalMutation.mutate({
      type: vault,
      goalName: goalName.trim() || null,
      goalAmount: goalAmount ? parseMoney(goalAmount, "USDT") : null,
      autoSweepPct,
      autoSweepEnabled,
    });
  };

  const openTransferDialog = (vault: VaultType, direction: TransferDirection) => {
    setTransferDialog({ open: true, vault, direction });
    setAmount("");
  };

  const openGoalDialog = (vault: VaultType, data: VaultData) => {
    setGoalDialog({ open: true, vault, data });
    setGoalName(data.goalName || "");
    setGoalAmount(data.goalAmount ? formatMoney(data.goalAmount, "USDT").replace(/[^0-9.]/g, "") : "");
    setAutoSweepPct(data.autoSweepPct);
    setAutoSweepEnabled(data.autoSweepEnabled);
  };

  const getVaultData = (type: VaultType): VaultData => {
    return bootstrap?.vaults[type] || defaultVaultData;
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Vaults" subtitle="Secure storage for your capital" backHref="/wallet" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </>
        ) : (
          <>
            <VaultCard
              type="principal"
              data={getVaultData("principal")}
              asset="USDT"
              onTransferIn={() => openTransferDialog("principal", "in")}
              onTransferOut={() => openTransferDialog("principal", "out")}
              onEditGoal={() => openGoalDialog("principal", getVaultData("principal"))}
            />
            <VaultCard
              type="profit"
              data={getVaultData("profit")}
              asset="USDT"
              onTransferIn={() => openTransferDialog("profit", "in")}
              onTransferOut={() => openTransferDialog("profit", "out")}
              onEditGoal={() => openGoalDialog("profit", getVaultData("profit"))}
            />
            <VaultCard
              type="taxes"
              data={getVaultData("taxes")}
              asset="USDT"
              onTransferIn={() => openTransferDialog("taxes", "in")}
              onTransferOut={() => openTransferDialog("taxes", "out")}
              onEditGoal={() => openGoalDialog("taxes", getVaultData("taxes"))}
            />
          </>
        )}
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Global Auto-Sweep</h3>
            <p className="text-sm text-muted-foreground">
              Automatically move daily payout profits to Profit Vault
            </p>
          </div>
          <Switch
            checked={bootstrap?.security.autoSweepEnabled || false}
            onCheckedChange={(checked) => {
              apiRequest("POST", "/api/security/auto-sweep", { enabled: checked }).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/bootstrap"] });
                toast({ title: "Auto-sweep updated" });
              });
            }}
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

      <Dialog open={goalDialog.open} onOpenChange={(open) => setGoalDialog({ ...goalDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {goalDialog.vault.charAt(0).toUpperCase() + goalDialog.vault.slice(1)} Vault Goal
            </DialogTitle>
            <DialogDescription>
              Set a savings goal and optional auto-sweep percentage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="goal-name">Goal Name (optional)</Label>
              <Input
                id="goal-name"
                type="text"
                placeholder="e.g., Emergency Fund"
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                className="mt-2"
                maxLength={50}
                data-testid="input-goal-name"
              />
            </div>
            <div>
              <Label htmlFor="goal-amount">Target Amount (USDT)</Label>
              <Input
                id="goal-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="mt-2"
                data-testid="input-goal-amount"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Auto-Sweep Profit</Label>
                <Switch
                  checked={autoSweepEnabled}
                  onCheckedChange={setAutoSweepEnabled}
                  data-testid="toggle-vault-auto-sweep"
                />
              </div>
              {autoSweepEnabled && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Percentage of profit</span>
                    <span className="font-medium">{autoSweepPct}%</span>
                  </div>
                  <Slider
                    value={[autoSweepPct]}
                    onValueChange={(v) => setAutoSweepPct(v[0])}
                    min={0}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-auto-sweep-pct"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Automatically transfer a percentage of daily profits to this vault
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleSaveGoal}
              disabled={goalMutation.isPending}
              data-testid="button-save-goal"
            >
              {goalMutation.isPending ? "Saving..." : "Save Goal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
