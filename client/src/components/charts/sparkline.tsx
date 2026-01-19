import { Line, LineChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ value: number }>;
  positive?: boolean;
  height?: number;
}

export function Sparkline({ data, positive = true, height = 24 }: SparklineProps) {
  const color = positive ? "hsl(var(--success))" : "hsl(var(--danger))";

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
