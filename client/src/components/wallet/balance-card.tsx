import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { formatMoney } from "@shared/schema";
import { Link } from "wouter";

interface BalanceCardProps {
  asset: string;
  available: string;
  locked: string;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export function BalanceCard({ asset, available, locked, onDeposit, onWithdraw }: BalanceCardProps) {
  const totalBalance = (BigInt(available) + BigInt(locked)).toString();

  return (
    <Card className="p-5" data-testid={`balance-card-${asset.toLowerCase()}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">{asset}</span>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{asset}</h3>
            <p className="text-xs text-muted-foreground">
              {asset === "USDT" ? "Tether (TRC20)" : "Russian Ruble"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-muted-foreground">Available</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatMoney(available, asset)}
          </span>
        </div>
        {BigInt(locked) > 0n && (
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Locked</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatMoney(locked, asset)}
            </span>
          </div>
        )}
        <div className="pt-2 border-t border-border">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(totalBalance, asset)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {asset === "USDT" ? (
          <>
            <Link href="/deposit/usdt" className="flex-1">
              <Button variant="outline" size="sm" className="w-full" data-testid={`deposit-${asset.toLowerCase()}`}>
                <Plus className="w-4 h-4 mr-1" />
                Deposit
              </Button>
            </Link>
            <Link href="/withdraw" className="flex-1">
              <Button variant="outline" size="sm" className="w-full" data-testid={`withdraw-${asset.toLowerCase()}`}>
                <ArrowUpRight className="w-4 h-4 mr-1" />
                Withdraw
              </Button>
            </Link>
          </>
        ) : (
          <Link href="/deposit/card" className="flex-1">
            <Button variant="outline" size="sm" className="w-full" data-testid={`deposit-${asset.toLowerCase()}`}>
              <Plus className="w-4 h-4 mr-1" />
              Top Up
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}
