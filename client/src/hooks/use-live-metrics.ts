import { useState, useCallback } from "react";

export interface LiveMetrics {
  [strategyId: string]: {
    pnl: number;
    pnlPct: number;
    equity: number;
    lastUpdated: Date | null;
  };
}

export function useLiveMetrics() {
  const [metrics, setMetrics] = useState<LiveMetrics>({});

  const getMetrics = useCallback((strategyId: string) => {
    return metrics[strategyId] || null;
  }, [metrics]);

  return { metrics, getMetrics };
}
