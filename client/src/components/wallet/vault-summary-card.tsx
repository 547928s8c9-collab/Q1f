import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Lock, TrendingUp, Receipt, ArrowRightLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VaultData } from "@shared/schema";

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}

interface VaultSummaryCardProps {
  principal?: VaultData;
  profit?: VaultData;
  taxes?: VaultData;
  asset?: string;
  onTransfer?: () => void;
  onViewDetails?: () => void;
}

const defaultVaultData: VaultData = {
  balance: "0",
  goalName: null,
  goalAmount: null,
  autoSweepPct: 0,
  autoSweepEnabled: false,
};

const vaultItems = [
  {
    key: "principal",
    label: "Principal",
    description: "Investment capital",
    icon: Lock,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    key: "profit",
    label: "Profit",
    description: "Earnings",
    icon: TrendingUp,
    color: "text-positive",
    bgColor: "bg-positive/10",
  },
  {
    key: "taxes",
    label: "Tax Reserve",
    description: "Set aside",
    icon: Receipt,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
] as const;

export function VaultSummaryCard({
  principal = defaultVaultData,
  profit = defaultVaultData,
  taxes = defaultVaultData,
  asset = "USDT",
  onTransfer,
  onViewDetails,
}: VaultSummaryCardProps) {
  const decimals = asset === "USDT" ? 6 : 2;
  const principalBalance = principal?.balance || "0";
  const profitBalance = profit?.balance || "0";
  const taxesBalance = taxes?.balance || "0";
  
  const vaultBalances = { 
    principal: principalBalance, 
    profit: profitBalance, 
    taxes: taxesBalance 
  };
  const totalMinor = (
    BigInt(principalBalance) + BigInt(profitBalance) + BigInt(taxesBalance)
  ).toString();
  const totalMajor = toMajorUnits(totalMinor, decimals);

  return (
    <Card className="p-5" data-testid="vault-summary-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Vaults</h3>
          <p className="text-xs text-muted-foreground">Separate funds by purpose</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">Total in Vaults</p>
          <span data-testid="text-vault-total">
            <Money value={totalMajor} currency={asset} size="lg" />
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {vaultItems.map((vault) => {
          const balance = vaultBalances[vault.key];
          const Icon = vault.icon;
          const hasBalance = BigInt(balance) > BigInt(0);

          return (
            <div
              key={vault.key}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg transition-colors",
                hasBalance ? "bg-muted/40" : "bg-muted/20"
              )}
              data-testid={`vault-row-${vault.key}`}
            >
              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", vault.bgColor)}>
                <Icon className={cn("w-4 h-4", vault.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{vault.label}</p>
                <p className="text-xs text-muted-foreground">{vault.description}</p>
              </div>
              <span data-testid={`text-vault-${vault.key}`}>
                <Money
                  value={toMajorUnits(balance, decimals)}
                  currency={asset}
                  size="sm"
                  className={cn("font-medium", !hasBalance && "text-muted-foreground")}
                />
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onTransfer}
          data-testid="button-vault-transfer"
        >
          <ArrowRightLeft className="w-4 h-4 mr-1.5" />
          Transfer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={onViewDetails}
          data-testid="button-vault-details"
        >
          View Details
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </Card>
  );
}
