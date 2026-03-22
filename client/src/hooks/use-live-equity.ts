import { useMemo } from "react";
import { useMarketStream } from "./use-market-stream";

interface StrategyAllocation {
  strategyId: string;
  symbol?: string | null;
  allocatedMinor: string;
  currentMinor: string;
  pnlMinor: string;
  roiPct: number;
}

interface LiveEquityResult {
  totalEquityMinor: number;
  totalPnlMinor: number;
  avgRoiPct: number;
  strategyDeltas: Map<string, { priceDelta: number; equityDelta: number }>;
  connected: boolean;
}

function normalizeSymbol(sym: string | null | undefined): string | null {
  if (!sym) return null;
  return sym.toUpperCase().replace("/", "") || null;
}

export function useLiveEquity(
  baseEquityMinor: string,
  basePnlMinor: string,
  baseRoiPct: number,
  strategies: StrategyAllocation[]
): LiveEquityResult {
  const { quotesMap, connected } = useMarketStream();

  return useMemo(() => {
    const baseEquity = parseInt(baseEquityMinor || "0", 10);
    const basePnl = parseInt(basePnlMinor || "0", 10);

    if (!connected || quotesMap.size === 0 || strategies.length === 0) {
      return {
        totalEquityMinor: baseEquity,
        totalPnlMinor: basePnl,
        avgRoiPct: baseRoiPct,
        strategyDeltas: new Map(),
        connected,
      };
    }

    let equityDeltaTotal = 0;
    const strategyDeltas = new Map<string, { priceDelta: number; equityDelta: number }>();

    for (const s of strategies) {
      const marketSym = normalizeSymbol(s.symbol);
      if (!marketSym) continue;

      const quote = quotesMap.get(marketSym);
      if (!quote) continue;

      const priceDeltaFraction = quote.change24hPct / 100;
      const allocated = parseInt(s.allocatedMinor || "0", 10);
      const delta = Math.round(allocated * priceDeltaFraction);

      equityDeltaTotal += delta;
      strategyDeltas.set(s.strategyId, {
        priceDelta: quote.change24hPct,
        equityDelta: delta,
      });
    }

    const liveEquity = baseEquity + equityDeltaTotal;
    const livePnl = basePnl + equityDeltaTotal;
    const liveRoi = baseEquity > 0 ? (livePnl / baseEquity) * 100 : baseRoiPct;

    return {
      totalEquityMinor: liveEquity,
      totalPnlMinor: livePnl,
      avgRoiPct: liveRoi,
      strategyDeltas,
      connected,
    };
  }, [baseEquityMinor, basePnlMinor, baseRoiPct, strategies, quotesMap, connected]);
}
