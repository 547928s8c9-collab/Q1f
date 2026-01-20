import { cn } from "@/lib/utils";

interface SparklineSVGProps {
  points: number[];
  className?: string;
  strokeClassName?: string;
  height?: number;
  width?: number;
}

export function SparklineSVG({
  points,
  className,
  strokeClassName = "stroke-primary",
  height = 48,
  width = 160,
}: SparklineSVGProps) {
  if (points.length === 0) {
    return (
      <div
        className={cn("flex h-12 w-full items-center justify-center rounded-md border border-dashed border-border/60 text-xs text-muted-foreground", className)}
      >
        No data
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const step = points.length > 1 ? width / (points.length - 1) : width;
  const normalized = points.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * height;
    return [x, y] as const;
  });

  const path = normalized
    .map((point, index) => `${index === 0 ? "M" : "L"}${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-12 w-full", className)}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        className={cn("stroke-[1.5]", strokeClassName)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
