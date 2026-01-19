import { Label, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CompareChartMode = "strategy" | "benchmark" | "both";

interface CompareChartProps {
  strategyData: Array<{ date: string; value: number }>;
  benchmarkData: Array<{ date: string; value: number }>;
  strategyName: string;
  benchmarkName: string;
  height?: number;
  mode?: CompareChartMode;
}

export function CompareChart({
  strategyData,
  benchmarkData,
  strategyName,
  benchmarkName,
  height = 320,
  mode = "both",
}: CompareChartProps) {
  const showStrategy = mode !== "benchmark";
  const showBenchmark = mode !== "strategy";
  const benchmarkByDate = new Map(benchmarkData.map((point) => [point.date, point.value]));

  const chartData = strategyData.map((point) => ({
    date: point.date,
    strategy: point.value,
    benchmark: benchmarkByDate.get(point.date) ?? 100,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 16 }}>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
            minTickGap={40}
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
            width={40}
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
              if (active && payload && payload.length) {
                const data = payload[0].payload as { date: string; strategy: number; benchmark: number };
                return (
                  <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      {new Date(data.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-border/60">
                        {showStrategy && (
                          <tr>
                            <td className="py-1 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                <span>{strategyName}</span>
                              </div>
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums">
                              {data.strategy.toFixed(1)}
                            </td>
                          </tr>
                        )}
                        {showBenchmark && (
                          <tr>
                            <td className="py-1 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                                <span>{benchmarkName}</span>
                              </div>
                            </td>
                            <td className="py-1 text-right font-semibold tabular-nums">
                              {data.benchmark.toFixed(1)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            content={() => (
              <div className="flex items-center justify-center gap-6 mt-4">
                {showStrategy && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-primary rounded" />
                    <span className="text-xs text-muted-foreground">{strategyName}</span>
                  </div>
                )}
                {showBenchmark && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-muted-foreground rounded" />
                    <span className="text-xs text-muted-foreground">{benchmarkName}</span>
                  </div>
                )}
              </div>
            )}
          />
          {showStrategy && (
            <Line
              type="monotone"
              dataKey="strategy"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              name={strategyName}
            />
          )}
          {showBenchmark && (
            <Line
              type="monotone"
              dataKey="benchmark"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name={benchmarkName}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
