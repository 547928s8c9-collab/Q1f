import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage, getResponseError } from "../lib/tgApi";

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

export interface TelegramBootstrapData {
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
}

interface TelegramBootstrapResponse {
  ok: boolean;
  data?: TelegramBootstrapData;
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

export function useTelegramSession() {
  const telegramApp = globalThis.window?.Telegram?.WebApp;
  const initData = telegramApp?.initData;
  const telegramAvailable = Boolean(initData);

  const [state, setState] = useState<ViewState>(telegramAvailable ? "authenticating" : "not-in-telegram");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<TelegramBootstrapData | null>(null);

  const loadBootstrap = useCallback(async (authToken: string) => {
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
  }, []);

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

  const confirmLink = useCallback(
    async (linkCode: string) => {
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

        await authenticate();
      } catch (err) {
        setError(getErrorMessage(err, "Ошибка привязки"));
        setState("needs-link");
      }
    },
    [authenticate, initData]
  );

  const refreshBootstrap = useCallback(async () => {
    if (!token) return;
    await loadBootstrap(token);
  }, [loadBootstrap, token]);

  useEffect(() => {
    if (!telegramAvailable) {
      setState("not-in-telegram");
      return;
    }

    telegramApp?.ready();
    telegramApp?.expand?.();
    authenticate();
  }, [authenticate, telegramApp, telegramAvailable]);

  const value = useMemo(
    () => ({
      state,
      token,
      error,
      bootstrap,
      refreshBootstrap,
      confirmLink,
      telegramAvailable,
    }),
    [bootstrap, confirmLink, error, refreshBootstrap, state, telegramAvailable, token]
  );

  return value;
}
