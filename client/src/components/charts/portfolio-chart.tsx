import { useState, useEffect, useMemo, useId } from "react";
import {
  Area,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

const Q1F_COLOR = "#0A84FF";
const BTC_COLOR = "#FF9F0A";
const SP_COLOR = "#30D158";

interface PortfolioChartProps {
  data: Array<{ date: string; value: string }>;
  height?: number;
  /** Number of days in the current period – used to fetch matching benchmark history */
  period?: number;
}

interface PriceMap {
  [date: string]: number; // YYYY-MM-DD → price
}

function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Fetch BTC daily prices from CoinGecko (no API key required). */
async function fetchBtcPrices(days: number): Promise<PriceMap> {
  const clampedDays = Math.min(days <= 0 ? 365 : days, 365);
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${clampedDays}&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = await res.json();
  const map: PriceMap = {};
  for (const [ts, price] of (json.prices ?? []) as [number, number][]) {
    const date = new Date(ts).toISOString().slice(0, 10);
    map[date] = price;
  }
  return map;
}

/** Fetch SPY daily close prices via server proxy (keeps API key server-side). */
async function fetchSpyPrices(days: number): Promise<PriceMap> {
  const res = await fetch(`/api/market/spy-prices?days=${days}`);
  if (!res.ok) throw new Error(`SPY proxy ${res.status}`);
  const json = await res.json();
  const series = (json.data?.["Time Series (Daily)"] ?? {}) as Record<
    string,
    Record<string, string>
  >;
  const map: PriceMap = {};
  for (const [date, vals] of Object.entries(series)) {
    map[date] = parseFloat(vals["4. close"]);
  }
  return map;
}

export function PortfolioChart({ data, height = 280, period = 30 }: PortfolioChartProps) {
  const gradientId = useId();
  const [showBtc, setShowBtc] = useState(false);
  const [showSp, setShowSp] = useState(false);
  const [btcPrices, setBtcPrices] = useState<PriceMap>({});
  const [spPrices, setSpPrices] = useState<PriceMap>({});

  // Lazy-load BTC prices when toggled on, or when period changes while active
  useEffect(() => {
    if (!showBtc) return;
    let cancelled = false;
    fetchBtcPrices(period)
      .then((m) => { if (!cancelled) setBtcPrices(m); })
      .catch(() => { if (!cancelled) setShowBtc(false); });
    return () => { cancelled = true; };
  }, [showBtc, period]);

  // Lazy-load SPY prices when toggled on, or when period changes while active
  useEffect(() => {
    if (!showSp) return;
    let cancelled = false;
    fetchSpyPrices(period)
      .then((m) => { if (!cancelled) setSpPrices(m); })
      .catch(() => { if (!cancelled) setShowSp(false); });
    return () => { cancelled = true; };
  }, [showSp, period]);

  // Normalize portfolio series to % change from period start
  const portfolioPcts = useMemo(() => {
    if (data.length === 0) return [];
    const startVal = parseFloat(data[0].value);
    return data.map((d) => {
      const v = parseFloat(d.value);
      return {
        date: d.date.slice(0, 10),
        q1f: startVal > 0 ? ((v - startVal) / startVal) * 100 : 0,
        displayValue: d.value,
      };
    });
  }, [data]);

  // Merge benchmark % changes aligned by date
  const chartData = useMemo(() => {
    if (portfolioPcts.length === 0) return [];

    const startDate = portfolioPcts[0].date;

    // Find the benchmark price on (or nearest before) the period start date
    function startPrice(map: PriceMap): number | null {
      if (map[startDate] !== undefined) return map[startDate];
      // Fallback: earliest available date
      const sorted = Object.keys(map).sort();
      return sorted.length > 0 ? map[sorted[0]] : null;
    }

    const btcStart = startPrice(btcPrices);
    const spStart = startPrice(spPrices);

    return portfolioPcts.map((pt) => {
      const btcPrice = btcPrices[pt.date];
      const spPrice = spPrices[pt.date];
      return {
        ...pt,
        btc:
          btcStart !== null && btcPrice !== undefined
            ? ((btcPrice - btcStart) / btcStart) * 100
            : null,
        sp:
          spStart !== null && spPrice !== undefined
            ? ((spPrice - spStart) / spStart) * 100
            : null,
      };
    });
  }, [portfolioPcts, btcPrices, spPrices]);

  // Y-axis domain covering all visible series
  const { yMin, yMax } = useMemo(() => {
    const vals: number[] = chartData.map((d) => d.q1f);
    if (showBtc) chartData.forEach((d) => { if (d.btc !== null) vals.push(d.btc); });
    if (showSp) chartData.forEach((d) => { if (d.sp !== null) vals.push(d.sp); });
    if (vals.length === 0) return { yMin: -5, yMax: 5 };
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.12, 1);
    return { yMin: lo - pad, yMax: hi + pad };
  }, [chartData, showBtc, showSp]);

  return (
    <div className="w-full">
      {/* Benchmark toggle pills */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Q1F – always active */}
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: Q1F_COLOR }}
        >
          Q1F
        </span>

        {/* BTC toggle */}
        <button
          onClick={() => setShowBtc((v) => !v)}
          className={cn(
            "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
            showBtc
              ? "text-white"
              : "bg-transparent",
          )}
          style={
            showBtc
              ? { background: BTC_COLOR, borderColor: BTC_COLOR, color: "#fff" }
              : { borderColor: BTC_COLOR, color: BTC_COLOR }
          }
          data-testid="toggle-btc"
        >
          BTC
        </button>

        {/* S&P 500 toggle */}
        <button
          onClick={() => setShowSp((v) => !v)}
          className={cn(
            "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
            showSp ? "text-white" : "bg-transparent",
          )}
          style={
            showSp
              ? { background: SP_COLOR, borderColor: SP_COLOR, color: "#fff" }
              : { borderColor: SP_COLOR, color: SP_COLOR }
          }
          data-testid="toggle-sp"
        >
          S&P 500
        </button>
      </div>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`q1fGradient-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={Q1F_COLOR} stopOpacity={0.18} />
                <stop offset="95%" stopColor={Q1F_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
              minTickGap={40}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) =>
                `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
              }
              domain={[yMin, yMax]}
              width={54}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const pt = payload[0].payload as typeof chartData[number];
                return (
                  <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg min-w-[160px]">
                    <p className="text-xs text-muted-foreground mb-2">
                      {new Date(pt.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <div className="space-y-1.5">
                      {/* Q1F row */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: Q1F_COLOR }}
                          />
                          <span className="text-xs text-muted-foreground">Q1F</span>
                        </div>
                        <span className="text-xs font-semibold tabular-nums">
                          {formatPct(pt.q1f)}
                        </span>
                      </div>

                      {/* BTC row */}
                      {showBtc && pt.btc !== null && (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: BTC_COLOR }}
                            />
                            <span className="text-xs text-muted-foreground">BTC</span>
                          </div>
                          <span className="text-xs font-semibold tabular-nums">
                            {formatPct(pt.btc)}
                          </span>
                        </div>
                      )}

                      {/* S&P 500 row */}
                      {showSp && pt.sp !== null && (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: SP_COLOR }}
                            />
                            <span className="text-xs text-muted-foreground">S&P 500</span>
                          </div>
                          <span className="text-xs font-semibold tabular-nums">
                            {formatPct(pt.sp)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />

            {/* Zero baseline */}
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />

            {/* Q1F — filled area, blue */}
            <Area
              type="monotone"
              dataKey="q1f"
              stroke={Q1F_COLOR}
              strokeWidth={2.5}
              fill={`url(#q1fGradient-${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: Q1F_COLOR }}
              isAnimationActive={false}
            />

            {/* BTC — dashed line, no fill */}
            {showBtc && (
              <Line
                type="monotone"
                dataKey="btc"
                stroke={BTC_COLOR}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 3, fill: BTC_COLOR }}
                connectNulls
                isAnimationActive={false}
              />
            )}

            {/* S&P 500 — dashed line, no fill */}
            {showSp && (
              <Line
                type="monotone"
                dataKey="sp"
                stroke={SP_COLOR}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 3, fill: SP_COLOR }}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
