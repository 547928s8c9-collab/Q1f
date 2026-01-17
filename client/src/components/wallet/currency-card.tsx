import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Plus, ArrowUpRight, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}

interface CurrencyCardProps {
  asset: "USDT" | "RUB";
  available: string;
  invested?: string;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

const currencyConfig = {
  USDT: {
    name: "Tether",
    network: "TRC20",
    icon: "₮",
    color: "bg-success/10 text-success",
  },
  RUB: {
    name: "Russian Ruble",
    network: "Bank Transfer",
    icon: "₽",
    color: "bg-primary/10 text-primary",
  },
};

export function CurrencyCard({
  asset,
  available,
  invested,
  onDeposit,
  onWithdraw,
}: CurrencyCardProps) {
  const config = currencyConfig[asset];
  const decimals = asset === "USDT" ? 6 : 2;
  const hasInvested = invested && BigInt(invested) > BigInt(0);
  const totalMinor = hasInvested
    ? (BigInt(available) + BigInt(invested)).toString()
    : available;

  const totalMajor = toMajorUnits(totalMinor, decimals);
  const availableMajor = toMajorUnits(available, decimals);
  const investedMajor = invested ? toMajorUnits(invested, decimals) : 0;

  return (
    <Card className="p-5" data-testid={`currency-card-${asset.toLowerCase()}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.color}`}>
          <span className="text-xl font-bold">{config.icon}</span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{asset}</h3>
          <p className="text-xs text-muted-foreground">{config.name} ({config.network})</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">Total Balance</p>
          <span data-testid={`text-total-balance-${asset.toLowerCase()}`}>
            <Money value={totalMajor} currency={asset} size="lg" />
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-4 bg-muted/30 rounded-lg p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">Available</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle 
                  className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" 
                  aria-label="What is Available balance"
                  data-testid={`tooltip-available-${asset.toLowerCase()}`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px]">
                <p className="text-xs">Funds ready to use for withdrawals, investments, or transfers</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span data-testid={`text-available-${asset.toLowerCase()}`}>
            <Money value={availableMajor} currency={asset} size="sm" className="font-medium" />
          </span>
        </div>

        {hasInvested && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Invested</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle 
                    className="w-3.5 h-3.5 text-muted-foreground/60 cursor-help" 
                    aria-label="What is Invested balance"
                    data-testid={`tooltip-invested-${asset.toLowerCase()}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                  <p className="text-xs">Capital currently working in investment strategies. Redeem to move back to Available.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span data-testid={`text-invested-${asset.toLowerCase()}`}>
              <Money value={investedMajor} currency={asset} size="sm" className="font-medium text-primary" />
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          className="flex-1"
          onClick={onDeposit}
          data-testid={`button-deposit-${asset.toLowerCase()}`}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          {asset === "USDT" ? "Deposit" : "Top Up"}
        </Button>
        {asset === "USDT" && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onWithdraw}
            data-testid={`button-withdraw-${asset.toLowerCase()}`}
          >
            <ArrowUpRight className="w-4 h-4 mr-1.5" />
            Withdraw
          </Button>
        )}
      </div>
    </Card>
  );
}
