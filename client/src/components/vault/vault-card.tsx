import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Lock, TrendingUp, Receipt } from "lucide-react";
import { formatMoney } from "@shared/schema";

interface VaultCardProps {
  type: "principal" | "profit" | "taxes";
  balance: string;
  asset: string;
  onTransferIn?: () => void;
  onTransferOut?: () => void;
}

const vaultConfig = {
  principal: {
    label: "Principal Vault",
    description: "Secured investment capital",
    icon: Lock,
    color: "bg-primary/10 text-primary",
  },
  profit: {
    label: "Profit Vault",
    description: "Accumulated earnings",
    icon: TrendingUp,
    color: "bg-positive/10 text-positive",
  },
  taxes: {
    label: "Tax Reserve",
    description: "Set aside for taxes",
    icon: Receipt,
    color: "bg-warning/10 text-warning",
  },
};

export function VaultCard({ type, balance, asset, onTransferIn, onTransferOut }: VaultCardProps) {
  const config = vaultConfig[type];
  const Icon = config.icon;

  return (
    <Card className="p-5" data-testid={`vault-card-${type}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{config.label}</h3>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Balance</p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(balance, asset)}
          <span className="text-sm text-muted-foreground font-normal ml-1">{asset}</span>
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onTransferIn}
          data-testid={`vault-${type}-transfer-in`}
        >
          <ArrowDownLeft className="w-4 h-4 mr-1" />
          Transfer In
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onTransferOut}
          data-testid={`vault-${type}-transfer-out`}
        >
          <ArrowUpRight className="w-4 h-4 mr-1" />
          Transfer Out
        </Button>
      </div>
    </Card>
  );
}
