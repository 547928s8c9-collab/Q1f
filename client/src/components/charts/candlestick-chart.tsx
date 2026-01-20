import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import { format } from "date-fns";
import type { Candle } from "@shared/schema";
import { useTheme } from "@/hooks/use-theme";

export interface CandlestickMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text?: string;
}

interface CandlestickChartProps {
  candles: Candle[];
  markers?: CandlestickMarker[];
  showVolume?: boolean;
  height?: number;
}

interface TooltipState {
  left: number;
  top: number;
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface OhlcState {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const toChartTime = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1000) as UTCTimestamp;

const getChartColors = (element: HTMLElement) => {
  const styles = getComputedStyle(element);
  const read = (name: string) => styles.getPropertyValue(name).trim();

  const card = read("--card") || read("--background");
  const text = read("--text") || read("--foreground");
  const muted = read("--text-muted") || read("--muted-foreground");
  const border = read("--border");
  const success = read("--success");
  const danger = read("--danger");

  return {
    background: `hsl(${card})`,
    text: `hsl(${text})`,
    muted: `hsl(${muted})`,
    border: border ? `hsl(${border} / 0.4)` : "rgba(148, 163, 184, 0.2)",
    up: success ? `hsl(${success})` : "#22c55e",
    down: danger ? `hsl(${danger})` : "#ef4444",
    volumeUp: success ? `hsl(${success} / 0.4)` : "rgba(34, 197, 94, 0.4)",
    volumeDown: danger ? `hsl(${danger} / 0.4)` : "rgba(239, 68, 68, 0.4)",
  };
};

export function CandlestickChart({
  candles,
  markers = [],
  showVolume = true,
  height = 320,
}: CandlestickChartProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const hasFitRef = useRef(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [ohlc, setOhlc] = useState<OhlcState | null>(null);

  const candleData = useMemo<CandlestickData[]>(
    () =>
      candles.map((candle) => ({
        time: toChartTime(candle.ts),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles]
  );

  const volumeData = useMemo(() => {
    return candles.map((candle) => ({
      time: toChartTime(candle.ts),
      value: candle.volume,
      up: candle.close >= candle.open,
    }));
  }, [candles]);

  const markerData = useMemo<SeriesMarker<UTCTimestamp>[]>(
    () =>
      markers.map((marker) => ({
        time: toChartTime(marker.time),
        position: marker.position,
        color: marker.color,
        shape: marker.shape,
        text: marker.text,
      })),
    [markers]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const colors = getChartColors(container);
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "var(--font-sans)",
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });

    let volumeSeries: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        borderVisible: false,
      });
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: nextWidth, height: nextHeight } = entry.contentRect;
        chart.applyOptions({ width: nextWidth, height: nextHeight });
      }
    });

    resizeObserver.observe(container);

    const handleCrosshairMove = (param: {
      time?: UTCTimestamp;
      point?: { x: number; y: number };
      seriesData: Map<unknown, unknown>;
    }) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        return;
      }

      const series = candleSeriesRef.current;
      if (!series) {
        setTooltip(null);
        return;
      }

      const ohlc = param.seriesData.get(series) as CandlestickData | undefined;
      if (!ohlc) {
        setTooltip(null);
        return;
      }

      const rect = container.getBoundingClientRect();
      const tooltipWidth = 160;
      const tooltipHeight = 86;
      const left = Math.min(Math.max(param.point.x + 12, 8), rect.width - tooltipWidth - 8);
      const top = Math.min(Math.max(param.point.y - tooltipHeight - 12, 8), rect.height - tooltipHeight - 8);

      setTooltip({
        left,
        top,
        timeLabel: format(new Date(param.time * 1000), "MMM d, HH:mm"),
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
      });
      setOhlc({
        timeLabel: format(new Date(param.time * 1000), "MMM d, HH:mm"),
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
      });
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
  }, [height, showVolume]);

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!container || !chart || !candleSeries) return;

    const colors = getChartColors(container);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
      timeScale: {
        borderColor: colors.border,
      },
    });

    candleSeries.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
  }, [theme]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    candleSeries.setData(candleData);

    if (!hasFitRef.current) {
      chartRef.current?.timeScale().fitContent();
      hasFitRef.current = true;
    } else {
      chartRef.current?.timeScale().scrollToRealTime();
    }

    const last = candleData[candleData.length - 1];
    if (last) {
      setOhlc({
        timeLabel: format(new Date(Number(last.time) * 1000), "MMM d, HH:mm"),
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });
    }
  }, [candleData]);

  useEffect(() => {
    const volumeSeries = volumeSeriesRef.current;
    const container = containerRef.current;
    if (!volumeSeries || !container) return;

    const colors = getChartColors(container);
    volumeSeries.setData(
      volumeData.map((bar) => ({
        time: bar.time,
        value: bar.value,
        color: bar.up ? colors.volumeUp : colors.volumeDown,
      }))
    );
  }, [volumeData]);

  useEffect(() => {
    candleSeriesRef.current?.setMarkers(markerData);
  }, [markerData]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {ohlc && (
        <div className="absolute left-3 top-3 rounded-md border border-border/60 bg-card/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
          <span className="mr-2 text-[10px] uppercase tracking-wide">{ohlc.timeLabel}</span>
          <span className="tabular-nums text-foreground">O {ohlc.open.toFixed(2)}</span>
          <span className="mx-1 text-muted-foreground/60">·</span>
          <span className="tabular-nums text-foreground">H {ohlc.high.toFixed(2)}</span>
          <span className="mx-1 text-muted-foreground/60">·</span>
          <span className="tabular-nums text-foreground">L {ohlc.low.toFixed(2)}</span>
          <span className="mx-1 text-muted-foreground/60">·</span>
          <span className="tabular-nums text-foreground">C {ohlc.close.toFixed(2)}</span>
        </div>
      )}
      {tooltip && (
        <div
          className="absolute rounded-md border border-border/60 bg-card/95 px-3 py-2 text-xs shadow-lg text-muted-foreground"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {tooltip.timeLabel}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
            <span>O</span>
            <span className="text-foreground tabular-nums">
              {tooltip.open.toFixed(2)}
            </span>
            <span>H</span>
            <span className="text-foreground tabular-nums">
              {tooltip.high.toFixed(2)}
            </span>
            <span>L</span>
            <span className="text-foreground tabular-nums">
              {tooltip.low.toFixed(2)}
            </span>
            <span>C</span>
            <span className="text-foreground tabular-nums">
              {tooltip.close.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
