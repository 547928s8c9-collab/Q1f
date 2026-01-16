import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Lock, TrendingUp, Receipt, Target, Settings, Check } from "lucide-react";
import { formatMoney } from "@shared/schema";
import type { VaultData } from "@shared/schema";

const MILESTONES = [25, 50, 75, 100] as const;

interface VaultCardProps {
  type: "principal" | "profit" | "taxes";
  data: VaultData;
  asset: string;
  onTransferIn?: () => void;
  onTransferOut?: () => void;
  onEditGoal?: () => void;
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

export function VaultCard({ type, data, asset, onTransferIn, onTransferOut, onEditGoal }: VaultCardProps) {
  const config = vaultConfig[type];
  const Icon = config.icon;
  const hasGoal = data.goalAmount && BigInt(data.goalAmount) > 0;

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
        <Button
          variant="ghost"
          size="icon"
          onClick={onEditGoal}
          data-testid={`vault-${type}-edit-goal`}
          aria-label="Edit goal"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Balance</p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(data.balance, asset)}
          <span className="text-sm text-muted-foreground font-normal ml-1">{asset}</span>
        </p>
      </div>

      {hasGoal && (() => {
        const cappedProgress = Math.max(0, Math.min(data.progress, 100));
        return (
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Target className="w-3 h-3" />
                <span>{data.goalName || "Goal"}</span>
              </div>
              <span className="text-foreground font-medium">{cappedProgress}%</span>
            </div>
            
            <div className="relative pr-1" data-testid={`vault-${type}-progress`}>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${cappedProgress}%` }}
                />
              </div>
              
              <div className="absolute top-0 left-0 right-1 h-2 flex">
                {MILESTONES.map((milestone) => (
                  <div
                    key={milestone}
                    className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-background/80"
                    style={{ left: `${milestone}%`, transform: 'translate(-50%, -50%)' }}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex justify-between" data-testid={`vault-${type}-milestones`}>
              {MILESTONES.map((milestone) => {
                const achieved = cappedProgress >= milestone;
                return (
                  <div 
                    key={milestone} 
                    className="flex flex-col items-center gap-0.5"
                    data-testid={`vault-${type}-milestone-${milestone}`}
                    data-achieved={achieved}
                  >
                    <div 
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-all ${
                        achieved 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {achieved ? <Check className="w-3 h-3" /> : milestone}
                    </div>
                    <span className={`text-[10px] ${achieved ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                      {milestone}%
                    </span>
                  </div>
                );
              })}
            </div>
            
            <p className="text-xs text-muted-foreground">
              {formatMoney(data.balance, asset)} / {formatMoney(data.goalAmount!, asset)} {asset}
            </p>
          </div>
        );
      })()}

      {data.autoSweepEnabled && data.autoSweepPct > 0 && (
        <div className="mb-4 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground">
          Auto-sweep: {data.autoSweepPct}% of profit
        </div>
      )}

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
