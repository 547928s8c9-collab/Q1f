import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { formatMoney } from "@shared/schema";

interface PortfolioChartProps {
  data: Array<{ date: string; value: string }>;
  height?: number;
}

export function PortfolioChart({ data, height = 280 }: PortfolioChartProps) {
  const chartData = data.map((d) => ({
    date: d.date,
    value: parseFloat(d.value) / 1000000,
    displayValue: d.value,
  }));

  const minValue = Math.min(...chartData.map((d) => d.value));
  const maxValue = Math.max(...chartData.map((d) => d.value));
  const padding = (maxValue - minValue) * 0.1;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(24, 85%, 48%)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="hsl(24, 85%, 48%)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            domain={[minValue - padding, maxValue + padding]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-popover border border-popover-border rounded-lg p-3 shadow-lg">
                    <p className="text-xs text-muted-foreground mb-1">
                      {new Date(data.date).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(data.displayValue, "USDT")} <span className="text-sm text-muted-foreground">USDT</span>
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <ReferenceLine y={chartData[0]?.value} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(24, 85%, 48%)"
            strokeWidth={2}
            fill="url(#portfolioGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
