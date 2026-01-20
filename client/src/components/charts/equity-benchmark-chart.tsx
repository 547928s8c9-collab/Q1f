import { Label, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IndexedPoint } from "@/lib/performance";

export type EquitySeriesKey = "strategy" | "sp500" | "btc" | "gold";

export interface EquityBenchmarkChartProps {
  strategyData: IndexedPoint[];
  benchmarks: {
    sp500?: IndexedPoint[];
    btc?: IndexedPoint[];
    gold?: IndexedPoint[];
  };
  visibility: Record<EquitySeriesKey, boolean>;
  labels: Record<EquitySeriesKey, string>;
  height?: number;
}

const colors: Record<EquitySeriesKey, string> = {
  strategy: "hsl(var(--primary))",
  sp500: "hsl(var(--muted-foreground))",
  btc: "hsl(var(--warning))",
  gold: "hsl(var(--success))",
};

function buildChartData(strategyData: IndexedPoint[], benchmarks: EquityBenchmarkChartProps["benchmarks"]) {
  if (strategyData.length === 0) return [];

  const benchmarkMaps = {
    sp500: new Map(benchmarks.sp500?.map((point) => [point.date, point.value])),
    btc: new Map(benchmarks.btc?.map((point) => [point.date, point.value])),
    gold: new Map(benchmarks.gold?.map((point) => [point.date, point.value])),
  };

  const lastValues = { sp500: 100, btc: 100, gold: 100 };

  return strategyData.map((point) => {
    const sp500 = benchmarkMaps.sp500.get(point.date);
    if (typeof sp500 === "number") lastValues.sp500 = sp500;
    const btc = benchmarkMaps.btc.get(point.date);
    if (typeof btc === "number") lastValues.btc = btc;
    const gold = benchmarkMaps.gold.get(point.date);
    if (typeof gold === "number") lastValues.gold = gold;

    return {
      date: point.date,
      strategy: point.value,
      sp500: lastValues.sp500,
      btc: lastValues.btc,
      gold: lastValues.gold,
    };
  });
}

export function EquityBenchmarkChart({
  strategyData,
  benchmarks,
  visibility,
  labels,
  height = 320,
}: EquityBenchmarkChartProps) {
  const chartData = buildChartData(strategyData, benchmarks);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 16 }}>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
            minTickGap={32}
          >
            <Label
              value="Date"
              position="insideBottom"
              offset={-8}
              style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
          </XAxis>
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            domain={[(dataMin: number) => Math.floor(dataMin - 5), (dataMax: number) => Math.ceil(dataMax + 5)]}
            tickFormatter={(value) => `${value.toFixed(0)}`}
            width={44}
          >
            <Label
              value="Indexed (Base 100)"
              angle={-90}
              position="insideLeft"
              style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
          </YAxis>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const data = payload[0].payload as Record<string, number | string>;
              return (
                <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    {new Date(String(data.date)).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border/60">
                      {(Object.keys(visibility) as EquitySeriesKey[]).map((key) => {
                        if (!visibility[key]) return null;
                        return (
                          <tr key={key}>
                            <td className="py-1 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[key] }} />
                                <span>{labels[key]}</span>
                              </div>
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums">
                              {Number(data[key]).toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            }}
          />
          {(Object.keys(visibility) as EquitySeriesKey[]).map((key) => {
            if (!visibility[key]) return null;
            return (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[key]}
                strokeWidth={key === "strategy" ? 2 : 1.5}
                strokeDasharray={key === "strategy" ? undefined : "4 4"}
                dot={false}
                name={labels[key]}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
