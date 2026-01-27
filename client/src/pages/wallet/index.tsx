import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { CurrencyCard } from "@/components/wallet/currency-card";
import { VaultSummaryCard } from "@/components/wallet/vault-summary-card";
import { TransferSheet } from "@/components/operations/transfer-sheet";
import { BalanceCardSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { Card } from "@/components/ui/card";
import { HelpCircle, TrendingUp } from "lucide-react";
import { Money } from "@/components/ui/money";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BootstrapResponse } from "@shared/schema";

function toMajorUnits(minorUnits: string, decimals: number = 6): number {
  const value = BigInt(minorUnits || "0");
  const divisor = BigInt(Math.pow(10, decimals));
  const majorPart = value / divisor;
  const remainder = value % divisor;
  return Number(majorPart) + Number(remainder) / Math.pow(10, decimals);
}

export default function Wallet() {
  useSetPageTitle("Wallet");
  const [, navigate] = useLocation();
  const [transferOpen, setTransferOpen] = useState(false);

  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const handleDeposit = (asset: "USDT" | "RUB") => {
    if (asset === "USDT") {
      navigate("/deposit/usdt");
    } else {
      navigate("/deposit/card");
    }
  };

  const handleWithdraw = () => {
    navigate("/withdraw");
  };

  const handleVaultTransfer = () => {
    setTransferOpen(true);
  };

  const handleViewVaultDetails = () => {
    navigate("/wallet/vaults");
  };

  const investedCurrent = bootstrap?.invested?.current || "0";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto pb-24">
      <PageHeader 
        title="Wallet" 
        subtitle="Manage your balances and vaults"
      />

      <section className="mb-8">
        <SectionHeader 
          title="Balances" 
          className="mb-4"
          action={
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-xs">Available vs Invested</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle 
                    className="w-3.5 h-3.5 cursor-help" 
                    aria-label="Available vs Invested info"
                    data-testid="tooltip-balances-info"
                  />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[250px]">
                  <p className="text-xs mb-2">
                    <strong>Available:</strong> Funds you can withdraw, invest, or transfer at any time.
                  </p>
                  <p className="text-xs">
                    <strong>Invested:</strong> Capital working in strategies. Redeem to move back to Available.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <>
              <BalanceCardSkeleton />
              <BalanceCardSkeleton />
            </>
          ) : bootstrap && (
            <>
              <CurrencyCard
                asset="USDT"
                available={bootstrap.balances?.USDT?.available || "0"}
                invested={investedCurrent}
                onDeposit={() => handleDeposit("USDT")}
                onWithdraw={handleWithdraw}
              />
              <CurrencyCard
                asset="RUB"
                available={bootstrap.balances?.RUB?.available || "0"}
                onDeposit={() => handleDeposit("RUB")}
              />
            </>
          )}
        </div>
      </section>

      <section className="mb-8">
        <SectionHeader title="Invested Capital" className="mb-4" />

        <Card className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Currently in strategies</p>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Value</p>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <span data-testid="text-invested-current">
                <Money 
                  value={toMajorUnits(bootstrap?.invested?.current || "0", 6)} 
                  currency="USDT" 
                  size="2xl" 
                />
              </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Principal</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <span data-testid="text-invested-principal">
                <Money 
                  value={toMajorUnits(bootstrap?.invested?.principal || "0", 6)} 
                  currency="USDT" 
                  size="lg"
                  variant="muted"
                />
              </span>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader 
          title="Vaults" 
          className="mb-4"
          action={
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle 
                  className="w-3.5 h-3.5 text-muted-foreground cursor-help" 
                  aria-label="What are Vaults"
                  data-testid="tooltip-vaults-info"
                />
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[250px]">
                <p className="text-xs">
                  Organize your funds by purpose: keep principal safe, track profits separately, and set aside for taxes.
                </p>
              </TooltipContent>
            </Tooltip>
          }
        />

        {isLoading ? (
          <BalanceCardSkeleton />
        ) : bootstrap && bootstrap.vaults && (
          <VaultSummaryCard
            principal={bootstrap.vaults.principal}
            profit={bootstrap.vaults.profit}
            taxes={bootstrap.vaults.taxes}
            onTransfer={handleVaultTransfer}
            onViewDetails={handleViewVaultDetails}
          />
        )}
      </section>

      {bootstrap && (
        <TransferSheet
          open={transferOpen}
          onOpenChange={setTransferOpen}
          bootstrap={bootstrap}
        />
      )}
    </div>
  );
}
