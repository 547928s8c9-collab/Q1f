import { useEffect, useMemo, useRef } from "react";
import {
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";

export interface CandleDatum {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text?: string;
}

interface CandlestickChartProps {
  candles: CandleDatum[];
  markers?: CandleMarker[];
  height?: number;
  showVolume?: boolean;
}

const FALLBACK_COLORS = {
  background: "#0f172a",
  text: "#e2e8f0",
  border: "#1f2937",
  grid: "#1e293b",
  up: "#22c55e",
  down: "#ef4444",
};

const toUtc = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

function getThemeColor(variable: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `hsl(${value})` : fallback;
}

export function CandlestickChart({
  candles,
  markers = [],
  height = 420,
  showVolume = true,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const theme = useMemo(() => {
    return {
      background: getThemeColor("--card", FALLBACK_COLORS.background),
      text: getThemeColor("--card-foreground", FALLBACK_COLORS.text),
      border: getThemeColor("--card-border", FALLBACK_COLORS.border),
      grid: getThemeColor("--card-border", FALLBACK_COLORS.grid),
      muted: getThemeColor("--muted-foreground", "#94a3b8"),
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: theme.background },
        textColor: theme.text,
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      rightPriceScale: {
        borderColor: theme.border,
      },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: theme.muted, style: 3 },
        horzLine: { color: theme.muted, style: 3 },
      },
      width: containerRef.current.clientWidth,
      height,
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: FALLBACK_COLORS.up,
      downColor: FALLBACK_COLORS.down,
      wickUpColor: FALLBACK_COLORS.up,
      wickDownColor: FALLBACK_COLORS.down,
      borderUpColor: FALLBACK_COLORS.up,
      borderDownColor: FALLBACK_COLORS.down,
    });

    let volumeSeries: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      volumeSeries = chart.addHistogramSeries({
        priceScaleId: "",
        priceFormat: { type: "volume" },
        color: theme.muted,
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
      });
    }

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    const tooltipEl = tooltipRef.current;
    const updateTooltip = (param: {
      time?: UTCTimestamp | { year: number; month: number; day: number };
      point?: { x: number; y: number };
      seriesData: Map<ISeriesApi<"Candlestick">, any>;
    }) => {
      if (!tooltipEl || !param.point || !param.time || !candleSeriesRef.current) {
        if (tooltipEl) tooltipEl.style.opacity = "0";
        return;
      }

      const seriesData = param.seriesData.get(candleSeriesRef.current);
      if (!seriesData || typeof seriesData.open !== "number") {
        tooltipEl.style.opacity = "0";
        return;
      }

      const time =
        typeof param.time === "number"
          ? new Date(param.time * 1000)
          : new Date(Date.UTC(param.time.year, param.time.month - 1, param.time.day));

      tooltipEl.style.opacity = "1";
      tooltipEl.innerHTML = `
        <div style="font-size: 0.75rem; color: ${theme.muted};">${time.toLocaleString()}</div>
        <div style="margin-top: 0.25rem; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.25rem 0.5rem; font-size: 0.75rem;">
          <span style="color: ${theme.muted};">O</span><span style="font-variant-numeric: tabular-nums;">${seriesData.open.toFixed(2)}</span>
          <span style="color: ${theme.muted};">H</span><span style="font-variant-numeric: tabular-nums;">${seriesData.high.toFixed(2)}</span>
          <span style="color: ${theme.muted};">L</span><span style="font-variant-numeric: tabular-nums;">${seriesData.low.toFixed(2)}</span>
          <span style="color: ${theme.muted};">C</span><span style="font-variant-numeric: tabular-nums;">${seriesData.close.toFixed(2)}</span>
        </div>
      `;

      const containerBounds = containerRef.current?.getBoundingClientRect();
      if (!containerBounds) return;
      const tooltipWidth = 150;
      const tooltipHeight = 86;

      const left = Math.min(
        Math.max(param.point.x + 16, 12),
        containerBounds.width - tooltipWidth - 12,
      );
      const top = Math.min(
        Math.max(param.point.y - tooltipHeight - 12, 12),
        containerBounds.height - tooltipHeight - 12,
      );

      tooltipEl.style.transform = `translate(${left}px, ${top}px)`;
    };

    chart.subscribeCrosshairMove(updateTooltip);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: entry.contentRect.width,
        height,
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(updateTooltip);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, showVolume, theme.background, theme.border, theme.grid, theme.muted, theme.text]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const candleData = candles.map((candle) => ({
      time: toUtc(candle.ts),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    candleSeriesRef.current.setData(candleData);

    if (volumeSeriesRef.current) {
      const volumeData = candles.map((candle) => ({
        time: toUtc(candle.ts),
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    if (candles.length > 0) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.setMarkers(
      markers.map((marker) => ({
        ...marker,
        time: toUtc(marker.time),
      })),
    );
  }, [markers]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-10 w-[150px] rounded-md border border-border bg-card/95 p-2 text-foreground shadow-lg transition-opacity duration-150"
        style={{ opacity: 0 }}
      />
    </div>
  );
}
