import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMoney } from "@shared/schema";

interface TelegramAuthResponse {
  ok: boolean;
  data?: {
    token: string;
    expiresAt: string | null;
    userId: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface TelegramLinkResponse {
  ok: boolean;
  data?: {
    userId: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface TelegramBootstrapResponse {
  ok: boolean;
  data?: {
    user: {
      id: string;
      email?: string;
    };
    balances: Array<{
      asset: string;
      available: string;
      locked: string;
    }>;
    positions: Array<{
      id: string;
      strategyId: string;
      strategyName: string;
      principalMinor: string;
      currentMinor: string;
    }>;
    notifications: {
      unreadCount: number;
    };
    serverTime: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

type ViewState =
  | "not-in-telegram"
  | "authenticating"
  | "needs-link"
  | "linking"
  | "loading"
  | "ready"
  | "error";

function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) {
      return message;
    }
  }

  return fallback;
}

function getResponseError(payload: { error?: { message?: string } } | null | undefined, fallback: string) {
  return payload?.error?.message ?? fallback;
}

export default function TelegramMiniApp() {
  const telegramApp = globalThis.window?.Telegram?.WebApp;
  const initData = telegramApp?.initData;
  const telegramAvailable = Boolean(initData);

  const [state, setState] = useState<ViewState>(telegramAvailable ? "authenticating" : "not-in-telegram");
  const [token, setToken] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<TelegramBootstrapResponse["data"] | null>(null);

  const totalBalanceMinor = useMemo(() => {
    if (!bootstrap?.balances) {
      return "0";
    }

    const total = bootstrap.balances
      .filter((balance) => balance.asset === "USDT")
      .reduce((acc, balance) => acc + BigInt(balance.available) + BigInt(balance.locked), BigInt(0));

    return total.toString();
  }, [bootstrap?.balances]);

  const loadBootstrap = useCallback(
    async (authToken: string) => {
      setState("loading");
      setError(null);

      try {
        const response = await fetch("/api/tg/bootstrap", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const payload = (await response.json()) as TelegramBootstrapResponse;

        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(getResponseError(payload, "Не удалось загрузить данные"));
        }

        setBootstrap(payload.data);
        setState("ready");
      } catch (err) {
        setError(getErrorMessage(err, "Ошибка загрузки данных"));
        setState("error");
      }
    },
    [],
  );

  const authenticate = useCallback(async () => {
    if (!initData) {
      setError("Telegram initData отсутствует.");
      setState("error");
      return;
    }

    setState("authenticating");
    setError(null);

    try {
      const response = await fetch("/api/telegram/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ initData }),
      });

      const payload = (await response.json()) as TelegramAuthResponse;

      if (!response.ok || !payload.ok || !payload.data) {
        if (payload.error?.code === "TELEGRAM_NOT_LINKED") {
          setState("needs-link");
          setError("Аккаунт ещё не связан. Введите код из бота.");
          return;
        }

        throw new Error(getResponseError(payload, "Не удалось авторизоваться"));
      }

      setToken(payload.data.token);
      await loadBootstrap(payload.data.token);
    } catch (err) {
      setError(getErrorMessage(err, "Ошибка авторизации"));
      setState("error");
    }
  }, [initData, loadBootstrap]);

  const handleLink = useCallback(async () => {
    if (!initData) {
      setError("Telegram initData отсутствует.");
      setState("error");
      return;
    }

    setState("linking");
    setError(null);

    try {
      const response = await fetch("/api/telegram/link/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ initData, code: linkCode }),
      });

      const payload = (await response.json()) as TelegramLinkResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(getResponseError(payload, "Не удалось связать аккаунт"));
      }

      setLinkCode("");
      await authenticate();
    } catch (err) {
      setError(getErrorMessage(err, "Ошибка привязки"));
      setState("needs-link");
    }
  }, [authenticate, initData, linkCode]);

  useEffect(() => {
    if (!telegramAvailable) {
      setState("not-in-telegram");
      return;
    }

    telegramApp?.ready();
    telegramApp?.expand?.();
    authenticate();
  }, [authenticate, telegramApp, telegramAvailable]);

  const headerTitle = useMemo(() => {
    switch (state) {
      case "not-in-telegram":
        return "Откройте страницу в Telegram";
      case "needs-link":
        return "Свяжите аккаунт";
      case "ready":
        return "Портфель в Telegram";
      case "error":
        return "Возникла ошибка";
      default:
        return "Проверяем доступ";
    }
  }, [state]);

  const showLinkForm = state === "needs-link" || state === "linking";

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Telegram Mini App
          </p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {headerTitle}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {state === "ready"
              ? "Ваши данные доступны в режиме чтения — спокойно и безопасно."
              : "Мы используем только Telegram WebApp и JWT, без cookie-сессий."}
          </p>
        </div>

        {state === "not-in-telegram" ? (
          <Card className={cn("rounded-2xl border border-card-border/70 bg-card/80 p-6 shadow-sm")}> 
            <CardHeader className="space-y-2 p-0">
              <CardTitle className="text-lg">Требуется Telegram WebApp</CardTitle>
              <CardDescription>
                Откройте /tg внутри Telegram, чтобы увидеть баланс, позиции и уведомления.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-6 p-0">
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link href="/">Назад на сайт</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {showLinkForm && (
              <Card className="rounded-2xl border border-card-border/70 bg-card/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Введите код для привязки</CardTitle>
                  <CardDescription>
                    Код можно получить в боте. Он подтвердит, что вы уже вошли в аккаунт на сайте.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    value={linkCode}
                    onChange={(event) => setLinkCode(event.target.value)}
                    placeholder="Код из Telegram-бота"
                    className="h-11"
                  />
                  {error && (
                    <p className="text-sm font-medium text-destructive">{error}</p>
                  )}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleLink}
                    disabled={!linkCode.trim() || state === "linking"}
                  >
                    {state === "linking" ? "Связываем..." : "Link"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!showLinkForm && state !== "ready" && (
              <Card className="rounded-2xl border border-card-border/70 bg-card/80 shadow-sm">
                <CardContent className="space-y-3 py-6">
                  <p className="text-sm text-muted-foreground">
                    {state === "authenticating"
                      ? "Проверяем Telegram-сессию..."
                      : state === "loading"
                        ? "Загружаем данные..."
                        : "Ожидаем подтверждения"}
                  </p>
                  {error && (
                    <p className="text-sm font-medium text-destructive">{error}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {state === "ready" && bootstrap && (
              <div className="space-y-4">
                <Card className="rounded-2xl border border-card-border/70 bg-card/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Total balance</CardTitle>
                    <CardDescription>USDT</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tabular-nums">
                      {formatMoney(totalBalanceMinor, "USDT")}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-card-border/70 bg-card/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Positions</CardTitle>
                    <CardDescription>Текущие стратегии и результат</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {bootstrap.positions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Пока нет активных позиций.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {bootstrap.positions.map((position) => (
                          <div
                            key={position.id}
                            className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {position.strategyName}
                              </p>
                              <p className="text-xs text-muted-foreground">Principal / Current</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold tabular-nums">
                                {formatMoney(position.principalMinor, "USDT")} / {" "}
                                {formatMoney(position.currentMinor, "USDT")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-card-border/70 bg-card/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Notifications</CardTitle>
                    <CardDescription>Unread</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold tabular-nums">
                      {bootstrap.notifications.unreadCount}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" variant="outline" className="w-full">
                    <Link href="/">На сайт</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="w-full"
                    onClick={() => token && loadBootstrap(token)}
                  >
                    Обновить
                  </Button>
                </div>
              </div>
            )}

            {state === "error" && (
              <Card className="rounded-2xl border border-destructive/40 bg-card/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Не удалось загрузить данные</CardTitle>
                  <CardDescription>{error ?? "Попробуйте ещё раз."}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button size="lg" className="w-full" onClick={authenticate}>
                    Повторить
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
