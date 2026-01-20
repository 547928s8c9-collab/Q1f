import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage, tgFetch } from "../lib/tgApi";

interface PollingOptions {
  enabled?: boolean;
  intervalMs?: number;
}

export function useTgPolling<T>(token: string | null, url: string | null, options: PollingOptions = {}) {
  const { enabled = true, intervalMs = 12_000 } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetcher = useCallback(async () => {
    if (!token || !url) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await tgFetch<T>(token, url);
      setData(result);
    } catch (err) {
      setError(getErrorMessage(err, "Ошибка загрузки"));
    } finally {
      setIsLoading(false);
    }
  }, [token, url]);

  useEffect(() => {
    if (!enabled) return;
    if (!token || !url) return;

    void fetcher();
    const id = window.setInterval(() => {
      void fetcher();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [enabled, fetcher, intervalMs, token, url]);

  return useMemo(() => ({ data, error, isLoading, refresh: fetcher }), [data, error, fetcher, isLoading]);
}
