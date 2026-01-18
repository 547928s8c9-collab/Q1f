import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";

export interface MarketCandle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleMarker {
  ts: number;
  position: "above" | "below";
  shape?: "arrowUp" | "arrowDown" | "circle";
  text?: string;
  color?: string;
}

interface CandlestickChartProps {
  candles: MarketCandle[];
  markers?: CandleMarker[];
  height?: number;
  showVolume?: boolean;
}

function toTimestamp(ts: number): UTCTimestamp {
  return Math.floor(ts / 1000) as UTCTimestamp;
}

function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) return fallback;
  return value.startsWith("#") ? value : `hsl(${value})`;
}

export function CandlestickChart({
  candles,
  markers = [],
  height = 320,
  showVolume = true,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi["addCandlestickSeries"]> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<IChartApi["addHistogramSeries"]> | null>(null);
  const hasFitContentRef = useRef(false);

  const theme = useMemo(() => {
    const background = resolveCssVar("--surface", "#0f0f0f");
    const border = resolveCssVar("--border", "rgba(148, 163, 184, 0.2)");
    const text = resolveCssVar("--muted-foreground", "#94a3b8");
    const up = resolveCssVar("--success", "#22c55e");
    const down = resolveCssVar("--danger", "#ef4444");
    return { background, border, text, up, down };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: theme.background },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.border },
        horzLines: { color: theme.border },
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
        mode: CrosshairMode.Magnet,
        vertLine: { color: theme.border },
        horzLine: { color: theme.border },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: theme.up,
      downColor: theme.down,
      borderUpColor: theme.up,
      borderDownColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });

    const volumeSeries = showVolume
      ? chart.addHistogramSeries({
          priceFormat: { type: "volume" },
          priceScaleId: "",
        })
      : null;

    if (volumeSeries) {
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const tooltip = tooltipRef.current;
    if (tooltip) {
      tooltip.style.background = theme.background;
      tooltip.style.borderColor = theme.border;
      tooltip.style.color = theme.text;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: nextWidth, height: nextHeight } = entry.contentRect;
        chart.applyOptions({ width: nextWidth, height: nextHeight });
      }
    });
    resizeObserver.observe(container);

    const handleCrosshairMove = (param: Parameters<IChartApi["subscribeCrosshairMove"]>[0]) => {
      if (!tooltipRef.current || !param.time || !param.point) {
        if (tooltipRef.current) tooltipRef.current.style.display = "none";
        return;
      }
      const seriesData = param.seriesData.get(candleSeries) as CandlestickData<UTCTimestamp> | undefined;
      if (!seriesData) {
        tooltipRef.current.style.display = "none";
        return;
      }

      const time = typeof param.time === "number"
        ? param.time
        : Date.UTC(param.time.year, param.time.month - 1, param.time.day) / 1000;
      const dateLabel = new Date(time * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      tooltipRef.current.innerHTML = `
        <div style="font-size: 11px; opacity: 0.7; margin-bottom: 4px;">${dateLabel}</div>
        <div style="font-size: 12px; font-weight: 600;">
          O ${seriesData.open.toFixed(2)} · H ${seriesData.high.toFixed(2)} · L ${seriesData.low.toFixed(2)} · C ${seriesData.close.toFixed(2)}
        </div>
      `;
      tooltipRef.current.style.display = "block";

      const containerWidth = container.clientWidth;
      const tooltipWidth = tooltipRef.current.offsetWidth;
      let left = param.point.x + 12;
      if (left + tooltipWidth > containerWidth) {
        left = containerWidth - tooltipWidth - 8;
      }
      tooltipRef.current.style.left = `${Math.max(8, left)}px`;
      tooltipRef.current.style.top = "12px";
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, showVolume, theme]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries) return;

    const candleData: CandlestickData<UTCTimestamp>[] = candles.map((c) => ({
      time: toTimestamp(c.ts),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(candleData);

    if (volumeSeries) {
      const volumeData: HistogramData<UTCTimestamp>[] = candles.map((c) => ({
        time: toTimestamp(c.ts),
        value: c.volume,
        color: c.close >= c.open ? theme.up : theme.down,
      }));
      volumeSeries.setData(volumeData);
    }

    if (candles.length > 0 && chartRef.current && !hasFitContentRef.current) {
      chartRef.current.timeScale().fitContent();
      hasFitContentRef.current = true;
    }
  }, [candles, theme]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    const markerData: SeriesMarker<UTCTimestamp>[] = markers.map((marker) => ({
      time: toTimestamp(marker.ts),
      position: marker.position === "above" ? "aboveBar" : "belowBar",
      color: marker.color || (marker.position === "above" ? theme.down : theme.up),
      shape: marker.shape || (marker.position === "above" ? "arrowDown" : "arrowUp"),
      text: marker.text,
    }));

    candleSeries.setMarkers(markerData);
  }, [markers, theme]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <div
        ref={tooltipRef}
        className="absolute z-10 rounded-lg border px-3 py-2 shadow-md"
        style={{ display: "none" }}
      />
    </div>
  );
}
