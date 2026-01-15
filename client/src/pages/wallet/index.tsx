import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { BalanceCard } from "@/components/wallet/balance-card";
import { BalanceCardSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { useSetPageTitle } from "@/hooks/use-page-title";
import { formatMoney, type BootstrapResponse } from "@shared/schema";
import { Vault, TrendingUp } from "lucide-react";

export default function Wallet() {
  useSetPageTitle("Wallet");
  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title="Wallet" subtitle="Manage your balances and deposits" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {isLoading ? (
          <>
            <BalanceCardSkeleton />
            <BalanceCardSkeleton />
          </>
        ) : bootstrap && (
          <>
            <BalanceCard
              asset="USDT"
              available={bootstrap.balances.USDT.available}
              locked={bootstrap.balances.USDT.locked}
            />
            <BalanceCard
              asset="RUB"
              available={bootstrap.balances.RUB.available}
              locked={bootstrap.balances.RUB.locked}
            />
          </>
        )}
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Invested Capital</h3>
              <p className="text-xs text-muted-foreground">Currently in strategies</p>
            </div>
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Value</p>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {formatMoney(bootstrap?.invested.current || "0", "USDT")}
                <span className="text-sm text-muted-foreground font-normal ml-1">USDT</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Principal</p>
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <p className="text-lg font-medium tabular-nums text-muted-foreground">
                {formatMoney(bootstrap?.invested.principal || "0", "USDT")}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Link href="/wallet/vaults">
        <Card className="p-5 hover-elevate cursor-pointer border border-card-border hover:border-primary/30 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Vault className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium">Vaults</h3>
                <p className="text-xs text-muted-foreground">Principal, Profit & Taxes</p>
              </div>
            </div>
            <div className="text-right">
              {isLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className="text-lg font-semibold tabular-nums">
                  {formatMoney(
                    (BigInt(bootstrap?.vaults.principal || "0") +
                      BigInt(bootstrap?.vaults.profit || "0") +
                      BigInt(bootstrap?.vaults.taxes || "0")).toString(),
                    "USDT"
                  )}
                  <span className="text-sm text-muted-foreground font-normal ml-1">USDT</span>
                </p>
              )}
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}
