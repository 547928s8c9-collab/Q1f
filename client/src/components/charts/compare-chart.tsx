import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

interface CompareChartProps {
  strategyData: Array<{ date: string; value: number }>;
  benchmarkData: Array<{ date: string; value: number }>;
  strategyName: string;
  benchmarkName: string;
  height?: number;
}

export function CompareChart({
  strategyData,
  benchmarkData,
  strategyName,
  benchmarkName,
  height = 320,
}: CompareChartProps) {
  const chartData = strategyData.map((s, i) => ({
    date: s.date,
    strategy: s.value,
    benchmark: benchmarkData[i]?.value ?? 100,
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
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
          />
          <YAxis
            hide
            domain={["dataMin - 5", "dataMax + 5"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                    <p className="text-xs text-muted-foreground mb-2">
                      {new Date(data.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-sm">{strategyName}:</span>
                        <span className="text-sm font-semibold tabular-nums">{data.strategy.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                        <span className="text-sm">{benchmarkName}:</span>
                        <span className="text-sm font-semibold tabular-nums">{data.benchmark.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            content={() => (
              <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-primary rounded" />
                  <span className="text-xs text-muted-foreground">{strategyName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-0.5 bg-muted-foreground rounded" />
                  <span className="text-xs text-muted-foreground">{benchmarkName}</span>
                </div>
              </div>
            )}
          />
          <Line
            type="monotone"
            dataKey="strategy"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            name={strategyName}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name={benchmarkName}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
