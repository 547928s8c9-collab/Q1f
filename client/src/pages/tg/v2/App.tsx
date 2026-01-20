import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { formatMoney } from "@shared/schema";
import type {
  TgActivityResponse,
  TgCandlesResponse,
  TgStrategiesResponse,
  TgStrategyDetailResponse,
  TgTradeEventsResponse,
  TgTradesResponse,
} from "@shared/contracts/tg";
import { BottomNav, type TgTabKey } from "./components/BottomNav";
import { SparklineSVG } from "./components/SparklineSVG";
import { StatusBadge } from "./components/StatusBadge";
import { useTelegramSession } from "./hooks/useTelegramSession";
import { useTgPolling } from "./hooks/useTgPolling";
import { tgFetch } from "./lib/tgApi";
import { formatBps, formatMinor, formatTs } from "./lib/format";

const RISK_FILTERS = ["ALL", "LOW", "CORE", "HIGH"] as const;

type RiskFilter = typeof RISK_FILTERS[number];

type Strategy = NonNullable<NonNullable<TgStrategiesResponse["data"]>["strategies"]>[number];

type StrategyDetail = NonNullable<TgStrategyDetailResponse["data"]>;

type Trade = NonNullable<NonNullable<TgTradesResponse["data"]>["trades"]>[number];

type TradeEvent = NonNullable<NonNullable<TgTradeEventsResponse["data"]>["events"]>[number];

const REFRESH_INTERVAL = 12_000;

function getTotalBalanceMinor(balances: Array<{ asset: string; available: string; locked: string }>) {
  return balances
    .filter((balance) => balance.asset === "USDT")
    .reduce((acc, balance) => acc + BigInt(balance.available) + BigInt(balance.locked), BigInt(0))
    .toString();
}

function buildSparklinePoints(series: Array<{ equityMinor: string }>) {
  return series.map((point) => Number(point.equityMinor));
}

export default function TelegramMiniAppV2() {
  const telegramApp = globalThis.window?.Telegram?.WebApp;
  const {
    state,
    token,
    error,
    bootstrap,
    refreshBootstrap,
    confirmLink,
    telegramAvailable,
  } = useTelegramSession();

  const [activeTab, setActiveTab] = useState<TgTabKey>("overview");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [linkCode, setLinkCode] = useState("");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [showPriceChart, setShowPriceChart] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const strategiesUrl = token ? `/api/tg/strategies?limit=50` : null;
  const strategiesQuery = useTgPolling<TgStrategiesResponse["data"]>(token, strategiesUrl, {
    intervalMs: REFRESH_INTERVAL,
    enabled: state === "ready",
  });

  const activityUrl = token ? `/api/tg/activity` : null;
  const activityQuery = useTgPolling<TgActivityResponse["data"]>(token, activityUrl, {
    intervalMs: REFRESH_INTERVAL,
    enabled: state === "ready",
  });

  const strategyDetailUrl = token && selectedStrategyId
    ? `/api/tg/strategies/${selectedStrategyId}?periodDays=30`
    : null;
  const strategyDetailQuery = useTgPolling<StrategyDetail>(token, strategyDetailUrl, {
    intervalMs: REFRESH_INTERVAL,
    enabled: Boolean(selectedStrategyId) && state === "ready",
  });

  const tradesUrl = token && selectedStrategyId
    ? `/api/tg/strategies/${selectedStrategyId}/trades?limit=20`
    : null;
  const tradesQuery = useTgPolling<TgTradesResponse["data"]>(token, tradesUrl, {
    intervalMs: REFRESH_INTERVAL,
    enabled: Boolean(selectedStrategyId) && state === "ready",
  });

  const [candles, setCandles] = useState<TgCandlesResponse["data"] | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [tradeEvents, setTradeEvents] = useState<TradeEvent[]>([]);
  const [tradeEventsLoading, setTradeEventsLoading] = useState(false);

  const filteredStrategies = useMemo(() => {
    const list = strategiesQuery.data?.strategies ?? [];
    if (riskFilter === "ALL") return list;
    return list.filter((strategy) => strategy.riskTier === riskFilter);
  }, [riskFilter, strategiesQuery.data?.strategies]);

  const topStrategies = useMemo(() => {
    const list = strategiesQuery.data?.strategies ?? [];
    return [...list]
      .sort((a, b) => Number(BigInt(b.equityMinor) - BigInt(a.equityMinor)))
      .slice(0, 3);
  }, [strategiesQuery.data?.strategies]);

  const totalEquityMinor = useMemo(() => {
    const totalBalance = bootstrap ? getTotalBalanceMinor(bootstrap.balances) : "0";
    const positionsTotal = (strategiesQuery.data?.strategies ?? []).reduce(
      (acc, strategy) => acc + BigInt(strategy.equityMinor),
      BigInt(0)
    );
    return (BigInt(totalBalance) + positionsTotal).toString();
  }, [bootstrap, strategiesQuery.data?.strategies]);

  const aggregatedMetrics = useMemo(() => {
    const strategies = strategiesQuery.data?.strategies ?? [];
    const totalPrincipal = strategies.reduce((acc, strategy) => acc + BigInt(strategy.equityMinor) - BigInt(strategy.pnlMinor), BigInt(0));
    const totalPnl = strategies.reduce((acc, strategy) => acc + BigInt(strategy.pnlMinor), BigInt(0));
    const roiBps = totalPrincipal > 0n ? Math.round((Number(totalPnl) / Number(totalPrincipal)) * 10000) : 0;
    const maxDrawdown = strategies.length > 0 ? Math.max(...strategies.map((strategy) => strategy.maxDrawdown30dBps)) : 0;
    return { roiBps, maxDrawdown };
  }, [strategiesQuery.data?.strategies]);

  const equitySeriesPoints = useMemo(() => {
    return buildSparklinePoints(strategyDetailQuery.data?.equitySeries ?? []);
  }, [strategyDetailQuery.data?.equitySeries]);

  const candlePoints = useMemo(() => {
    if (!candles?.candles?.length) return [];
    return candles.candles.map((candle) => candle.close);
  }, [candles?.candles]);

  const handleSelectStrategy = useCallback((strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setActiveTab("strategies");
  }, []);

  const handleRefresh = useCallback(async () => {
    await refreshBootstrap();
    await strategiesQuery.refresh();
    await activityQuery.refresh();
    if (selectedStrategyId) {
      await strategyDetailQuery.refresh();
      await tradesQuery.refresh();
    }
  }, [activityQuery, refreshBootstrap, selectedStrategyId, strategiesQuery, strategyDetailQuery, tradesQuery]);

  const handleFetchCandles = useCallback(async () => {
    if (!token || !selectedStrategyId) return;
    setCandlesLoading(true);
    try {
      const data = await tgFetch<TgCandlesResponse["data"]>(
        token,
        `/api/tg/strategies/${selectedStrategyId}/candles?limit=200&periodDays=7`
      );
      setCandles(data);
    } finally {
      setCandlesLoading(false);
    }
  }, [selectedStrategyId, token]);

  const handleSelectTrade = useCallback(
    async (trade: Trade) => {
      if (!token || !selectedStrategyId) return;
      setSelectedTrade(trade);
      setTradeEventsLoading(true);
      try {
        const data = await tgFetch<TgTradeEventsResponse["data"]>(
          token,
          `/api/tg/strategies/${selectedStrategyId}/trade-events?tradeId=${trade.id}&limit=200`
        );
        setTradeEvents(data.events);
      } finally {
        setTradeEventsLoading(false);
      }
    },
    [selectedStrategyId, token]
  );

  useEffect(() => {
    const backButton = telegramApp?.BackButton;
    if (!backButton) return;

    const handleBack = () => {
      setSelectedStrategyId(null);
      setShowPriceChart(false);
      setSelectedTrade(null);
      setTradeEvents([]);
    };

    if (selectedStrategyId) {
      backButton.show();
      backButton.onClick(handleBack);
    } else {
      backButton.hide();
      backButton.offClick(handleBack);
    }

    return () => {
      backButton.offClick(handleBack);
    };
  }, [selectedStrategyId, telegramApp]);

  useEffect(() => {
    if (showPriceChart && !candles) {
      void handleFetchCandles();
    }
  }, [candles, handleFetchCandles, showPriceChart]);

  useEffect(() => {
    setCandles(null);
    setShowPriceChart(false);
  }, [selectedStrategyId]);

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">TG Strategy Mini App v2</p>
        <h1 className="text-lg font-semibold">Portfolio</h1>
      </div>
      <Button variant="secondary" size="sm" onClick={handleRefresh}>
        Refresh
      </Button>
    </div>
  );

  if (!telegramAvailable) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 text-center text-foreground">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>Откройте в Telegram</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Этот экран доступен только внутри Telegram Mini App.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "authenticating" || state === "loading" || state === "linking") {
    return (
      <div className="min-h-screen bg-background px-6 py-10 text-center text-foreground">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>Проверяем доступ</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Это займёт пару секунд.</CardContent>
        </Card>
      </div>
    );
  }

  if (state === "needs-link") {
    return (
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>Свяжите аккаунт</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Введите код из бота, чтобы подключить портфель.</p>
            <Input
              placeholder="Код из бота"
              value={linkCode}
              onChange={(event) => setLinkCode(event.target.value)}
            />
            <Button className="w-full" onClick={() => confirmLink(linkCode)} disabled={!linkCode.trim()}>
              Подтвердить
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle>Возникла ошибка</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{error ?? "Не удалось загрузить данные."}</p>
            <Button className="w-full" variant="secondary" onClick={handleRefresh}>
              Повторить
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 pb-24 pt-6 text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        {header}

        {activeTab === "overview" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Total equity</CardTitle>
                <div className="text-3xl font-semibold tabular-nums">{formatMoney(totalEquityMinor, "USDT")}</div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">ROI 30d</p>
                  <p className="font-medium tabular-nums">{formatBps(aggregatedMetrics.roiBps)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max DD 30d</p>
                  <p className="font-medium tabular-nums">{formatBps(aggregatedMetrics.maxDrawdown)}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Top strategies</h2>
              <span className="text-xs text-muted-foreground">Live · 12s</span>
            </div>

            <div className="grid gap-3">
              {topStrategies.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    Стратегии появятся после первой активности.
                  </CardContent>
                </Card>
              )}
              {topStrategies.map((strategy) => (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => handleSelectStrategy(strategy.id)}
                  className="text-left"
                >
                  <Card className="transition hover:border-primary/40">
                    <CardContent className="flex items-center justify-between gap-3 py-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{strategy.name}</p>
                          <StatusBadge state={strategy.state} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {strategy.symbol ?? "–"} · {strategy.timeframe ?? "–"}
                        </div>
                        <div className="flex gap-3 text-xs">
                          <span className="tabular-nums">{formatMinor(strategy.equityMinor)} USDT</span>
                          <span
                            className={cn(
                              "tabular-nums",
                              BigInt(strategy.pnlMinor) >= 0n ? "text-emerald-500" : "text-rose-500"
                            )}
                          >
                            {BigInt(strategy.pnlMinor) >= 0n ? "+" : ""}
                            {formatMinor(strategy.pnlMinor)}
                          </span>
                        </div>
                      </div>
                      <SparklineSVG
                        points={buildSparklinePoints(strategy.sparkline)}
                        className="h-12 w-32"
                        strokeClassName={BigInt(strategy.pnlMinor) >= 0n ? "stroke-emerald-500" : "stroke-rose-500"}
                      />
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "strategies" && !selectedStrategyId && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {RISK_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setRiskFilter(filter)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    riskFilter === filter
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="grid gap-3">
              {filteredStrategies.length === 0 && (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    Нет стратегий по выбранному фильтру.
                  </CardContent>
                </Card>
              )}
              {filteredStrategies.map((strategy) => (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => handleSelectStrategy(strategy.id)}
                  className="text-left"
                >
                  <Card className="transition hover:border-primary/40">
                    <CardContent className="space-y-3 py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{strategy.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {strategy.symbol ?? "–"} · {strategy.timeframe ?? "–"}
                          </p>
                        </div>
                        <StatusBadge state={strategy.state} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Equity</p>
                          <p className="font-medium tabular-nums">{formatMinor(strategy.equityMinor)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">ROI 30d</p>
                          <p className="font-medium tabular-nums">{formatBps(strategy.roi30dBps)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Trades 24h</p>
                          <p className="font-medium tabular-nums">{strategy.trades24h}</p>
                        </div>
                      </div>
                      <SparklineSVG
                        points={buildSparklinePoints(strategy.sparkline)}
                        className="h-12 w-full"
                        strokeClassName={BigInt(strategy.pnlMinor) >= 0n ? "stroke-emerald-500" : "stroke-rose-500"}
                      />
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "strategies" && selectedStrategyId && strategyDetailQuery.data && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle>{strategyDetailQuery.data.strategy.name}</CardTitle>
                  <StatusBadge state={strategyDetailQuery.data.state} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {strategyDetailQuery.data.strategy.symbol ?? "–"} · {strategyDetailQuery.data.strategy.timeframe ?? "–"}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Equity</p>
                  <p className="font-medium tabular-nums">{formatMinor(strategyDetailQuery.data.equityMinor)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">PnL</p>
                  <p
                    className={cn(
                      "font-medium tabular-nums",
                      BigInt(strategyDetailQuery.data.pnlMinor) >= 0n ? "text-emerald-500" : "text-rose-500"
                    )}
                  >
                    {BigInt(strategyDetailQuery.data.pnlMinor) >= 0n ? "+" : ""}
                    {formatMinor(strategyDetailQuery.data.pnlMinor)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">ROI 30d</p>
                  <p className="font-medium tabular-nums">{formatBps(strategyDetailQuery.data.roi30dBps)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Max DD 30d</p>
                  <p className="font-medium tabular-nums">{formatBps(strategyDetailQuery.data.maxDrawdown30dBps)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Equity curve</CardTitle>
                <span className="text-xs text-muted-foreground">30d</span>
              </CardHeader>
              <CardContent>
                <SparklineSVG
                  points={equitySeriesPoints}
                  className="h-20 w-full"
                  strokeClassName={BigInt(strategyDetailQuery.data.pnlMinor) >= 0n ? "stroke-emerald-500" : "stroke-rose-500"}
                  height={80}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Price chart</CardTitle>
                <Button variant="secondary" size="sm" onClick={() => setShowPriceChart((prev) => !prev)}>
                  {showPriceChart ? "Hide" : "Show"}
                </Button>
              </CardHeader>
              <CardContent>
                {!showPriceChart && (
                  <p className="text-sm text-muted-foreground">Включите график цены, если нужен быстрый контекст.</p>
                )}
                {showPriceChart && (
                  <div className="space-y-2">
                    {candlesLoading && <p className="text-xs text-muted-foreground">Загрузка свечей…</p>}
                    {!candlesLoading && candlePoints.length === 0 && (
                      <p className="text-xs text-muted-foreground">Нет данных по свечам.</p>
                    )}
                    {!candlesLoading && candlePoints.length > 0 && (
                      <SparklineSVG points={candlePoints} className="h-24 w-full" height={96} strokeClassName="stroke-primary" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Recent trades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tradesQuery.isLoading && <p className="text-xs text-muted-foreground">Загрузка трейдов…</p>}
                {(tradesQuery.data?.trades ?? []).length === 0 && !tradesQuery.isLoading && (
                  <p className="text-xs text-muted-foreground">Трейды появятся после первых сигналов.</p>
                )}
                {(tradesQuery.data?.trades ?? []).map((trade) => (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => handleSelectTrade(trade)}
                    className="flex w-full items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{trade.symbol} · {trade.side}</p>
                      <p className="text-xs text-muted-foreground">{formatTs(trade.exitTs)}</p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        BigInt(trade.netPnlMinor) >= 0n ? "text-emerald-500" : "text-rose-500"
                      )}
                    >
                      {BigInt(trade.netPnlMinor) >= 0n ? "+" : ""}
                      {formatMinor(trade.netPnlMinor)}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Notifications</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="flex items-center justify-between">
                  <span>Unread</span>
                  <span className="font-medium tabular-nums">{activityQuery.data?.notifications.unreadCount ?? 0}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent trades</h2>
              <span className="text-xs text-muted-foreground">Live · 12s</span>
            </div>

            <div className="grid gap-3">
              {(activityQuery.data?.trades ?? []).length === 0 && (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    История активности скоро появится.
                  </CardContent>
                </Card>
              )}
              {(activityQuery.data?.trades ?? []).map((trade) => (
                <Card key={trade.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{trade.strategyName}</p>
                      <p className="text-xs text-muted-foreground">{trade.symbol} · {trade.side}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          BigInt(trade.netPnlMinor) >= 0n ? "text-emerald-500" : "text-rose-500"
                        )}
                      >
                        {BigInt(trade.netPnlMinor) >= 0n ? "+" : ""}
                        {formatMinor(trade.netPnlMinor)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatTs(trade.exitTs)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />

      <Drawer open={Boolean(selectedTrade)} onOpenChange={(open) => !open && setSelectedTrade(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Trade details</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {tradeEventsLoading && <p className="text-sm text-muted-foreground">Загрузка событий…</p>}
            {!tradeEventsLoading && tradeEvents.length === 0 && (
              <p className="text-sm text-muted-foreground">События пока не сформированы.</p>
            )}
            <div className="space-y-3">
              {tradeEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <p className="text-sm font-medium">{event.type}</p>
                  <p className="text-xs text-muted-foreground">{formatTs(event.ts)}</p>
                  {event.payloadJson && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(event.payloadJson, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
