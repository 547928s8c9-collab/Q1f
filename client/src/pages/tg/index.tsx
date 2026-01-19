import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type TelegramMiniAppState = "not-in-telegram" | "unauthorized" | "authorized";

export function getTelegramMiniAppState(
  telegramAvailable: boolean,
  authState: "unauthorized" | "authorized",
): TelegramMiniAppState {
  if (!telegramAvailable) {
    return "not-in-telegram";
  }
  return authState;
}

const stateCopy: Record<
  TelegramMiniAppState,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  "not-in-telegram": {
    eyebrow: "Telegram Mini App",
    title: "Откройте эту страницу внутри Telegram",
    description:
      "Эта версия приложения работает только в Telegram WebApp. Откройте ссылку через вашего бота, чтобы продолжить.",
  },
  unauthorized: {
    eyebrow: "Telegram Mini App",
    title: "Telegram app connected",
    description:
      "Мы видим Telegram WebApp, но авторизация ещё не выполнена. Скоро появится шаг входа.",
  },
  authorized: {
    eyebrow: "Telegram Mini App",
    title: "Вы авторизованы",
    description:
      "Доступ подтверждён. Дальше здесь появятся персональные данные и действия.",
  },
};

export default function TelegramMiniApp() {
  const telegramAvailable = Boolean(globalThis.window?.Telegram?.WebApp?.ready);
  const [authState] = useState<"unauthorized" | "authorized">("unauthorized");

  const viewState: TelegramMiniAppState = useMemo(
    () => getTelegramMiniAppState(telegramAvailable, authState),
    [authState, telegramAvailable],
  );

  useEffect(() => {
    if (telegramAvailable) {
      globalThis.window?.Telegram?.WebApp?.ready();
    }
  }, [telegramAvailable]);

  const content = stateCopy[viewState];

  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {content.eyebrow}
          </p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {content.title}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {content.description}
          </p>
        </div>

        <Card
          className={cn(
            "w-full rounded-2xl border border-card-border/70 bg-card/80 p-6 shadow-sm backdrop-blur",
            "transition-all duration-300"
          )}
        >
          <div className="space-y-4 text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Status
              </p>
              <p className="mt-2 text-base font-medium text-foreground">
                {viewState === "not-in-telegram"
                  ? "Not in Telegram"
                  : viewState === "unauthorized"
                    ? "Connected, waiting for auth"
                    : "Authorized"}
              </p>
            </div>

            <div className="h-px w-full bg-border" />

            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                {viewState === "not-in-telegram"
                  ? "Откройте ссылку в Telegram WebApp, чтобы продолжить настройку."
                  : "Мы готовим минимальный вход и безопасную проверку данных Telegram."}
              </p>
              <p>
                {viewState === "authorized"
                  ? "Следующий шаг — подключить ваш профиль и показать персональные данные."
                  : "Этот экран сохранит спокойный интерфейс без лишней навигации."}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {viewState === "not-in-telegram" ? (
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/">Назад на сайт</Link>
            </Button>
          ) : (
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/">На сайт</Link>
            </Button>
          )}
          <Button
            size="lg"
            variant="ghost"
            className="w-full sm:w-auto"
            disabled
          >
            Скоро: вход в Telegram
          </Button>
        </div>
      </div>
    </div>
  );
}
