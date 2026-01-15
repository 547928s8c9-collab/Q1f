import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { PortfolioChart } from "@/components/charts/portfolio-chart";
import { PeriodToggle } from "@/components/charts/period-toggle";
import { QuoteCard } from "@/components/ui/quote-card";
import { BalanceDisplay } from "@/components/ui/balance-display";
import { ChartSkeleton, Skeleton } from "@/components/ui/loading-skeleton";
import { type BootstrapResponse } from "@shared/schema";

export default function Home() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);

  const { data: bootstrap, isLoading } = useQuery<BootstrapResponse>({
    queryKey: ["/api/bootstrap"],
  });

  const filteredSeries = bootstrap?.portfolioSeries.slice(-period) || [];

  const totalPortfolio = bootstrap
    ? (BigInt(bootstrap.balances.USDT.available) + BigInt(bootstrap.invested.current)).toString()
    : "0";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
        {isLoading ? (
          <Skeleton className="h-10 w-48" />
        ) : (
          <BalanceDisplay amount={totalPortfolio} asset="USDT" size="xl" />
        )}
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Portfolio Performance</h2>
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        {isLoading ? (
          <ChartSkeleton height={280} />
        ) : (
          <PortfolioChart data={filteredSeries} height={280} />
        )}
      </Card>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Market Quotes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isLoading ? (
            <>
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </>
          ) : (
            bootstrap?.quotes && (
              <>
                <QuoteCard
                  pair="BTC/USDT"
                  price={bootstrap.quotes["BTC/USDT"].price}
                  change24h={bootstrap.quotes["BTC/USDT"].change24h}
                  series={bootstrap.quotes["BTC/USDT"].series}
                />
                <QuoteCard
                  pair="ETH/USDT"
                  price={bootstrap.quotes["ETH/USDT"].price}
                  change24h={bootstrap.quotes["ETH/USDT"].change24h}
                  series={bootstrap.quotes["ETH/USDT"].series}
                />
                <QuoteCard
                  pair="USDT/RUB"
                  price={bootstrap.quotes["USDT/RUB"].price}
                  change24h={bootstrap.quotes["USDT/RUB"].change24h}
                  series={bootstrap.quotes["USDT/RUB"].series}
                />
              </>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Available</p>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <p className="text-lg font-semibold tabular-nums">
              {bootstrap && <BalanceDisplay amount={bootstrap.balances.USDT.available} asset="USDT" size="md" showAsset={false} />}
              <span className="text-sm text-muted-foreground ml-1">USDT</span>
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Invested</p>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <p className="text-lg font-semibold tabular-nums">
              {bootstrap && <BalanceDisplay amount={bootstrap.invested.current} asset="USDT" size="md" showAsset={false} />}
              <span className="text-sm text-muted-foreground ml-1">USDT</span>
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Principal Vault</p>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <p className="text-lg font-semibold tabular-nums">
              {bootstrap && <BalanceDisplay amount={bootstrap.vaults.principal} asset="USDT" size="md" showAsset={false} />}
              <span className="text-sm text-muted-foreground ml-1">USDT</span>
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Profit Vault</p>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <p className="text-lg font-semibold tabular-nums">
              {bootstrap && <BalanceDisplay amount={bootstrap.vaults.profit} asset="USDT" size="md" showAsset={false} />}
              <span className="text-sm text-muted-foreground ml-1">USDT</span>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
