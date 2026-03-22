import { useState, useCallback } from "react";

export interface LiveStrategyMetrics {
  strategyId: string;
  profileSlug: string | null;
  symbol: string | null;
  timeframe: string | null;
  equityMinor: string;
  pnlMinor: string;
  roi30dBps: number;
  maxDrawdown30dBps: number;
  trades24h: number;
  state: string;
  updatedAt: string | null;
}

export interface LiveMetrics {
  [strategyId: string]: LiveStrategyMetrics;
}

export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<LiveMetrics>({});

  const getMetrics = useCallback((strategyId: string): LiveStrategyMetrics | null => {
    return metrics[strategyId] || null;
  }, [metrics]);

  return { metrics, getMetrics };
}
