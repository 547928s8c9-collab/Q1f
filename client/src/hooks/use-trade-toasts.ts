import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { emitProfitToast } from "@/components/floating-profit-toast";

interface SimTrade {
  id: string;
  netPnlMinor: string;
  status: string;
  createdAt: string;
}

export function useTradeToasts() {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const [sinceTs, setSinceTs] = useState<number | null>(null);

  const sinceParam = sinceTs ? `&since=${sinceTs}` : "";

  const { data } = useQuery<{ trades: SimTrade[] }>({
    queryKey: ["/api/trades/recent", sinceTs],
    queryFn: async () => {
      const res = await fetch(`/api/trades/recent?limit=20${sinceParam}`, { credentials: "include" });
      if (!res.ok) return { trades: [] };
      return res.json();
    },
    refetchInterval: 12_000,
    refetchOnWindowFocus: false,
  });

  const processNewTrades = useCallback((trades: SimTrade[]) => {
    let maxTs = sinceTs || 0;

    for (const trade of trades) {
      const ts = new Date(trade.createdAt).getTime();
      if (ts > maxTs) maxTs = ts;

      if (seenIdsRef.current.has(trade.id)) continue;
      seenIdsRef.current.add(trade.id);

      if (!initializedRef.current) continue;

      const pnlMinor = parseInt(trade.netPnlMinor || "0", 10);
      if (pnlMinor === 0) continue;
      const pnl = pnlMinor / 1_000_000;
      emitProfitToast(pnl, trade.id);
    }

    if (maxTs > (sinceTs || 0)) {
      setSinceTs(maxTs);
    }
  }, [sinceTs]);

  useEffect(() => {
    if (!data?.trades) return;

    processNewTrades(data.trades);

    if (!initializedRef.current) {
      initializedRef.current = true;
    }

    if (seenIdsRef.current.size > 200) {
      const arr = Array.from(seenIdsRef.current);
      seenIdsRef.current = new Set(arr.slice(-100));
    }
  }, [data, processNewTrades]);
}
