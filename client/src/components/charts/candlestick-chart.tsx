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

export interface CandlestickMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text?: string;
  tradeId?: string;
  type?: "entry" | "exit";
}

interface CandlestickChartProps {
  candles: Candle[];
  markers?: CandlestickMarker[];
  showVolume?: boolean;
  height?: number;
  onMarkerClick?: (marker: CandlestickMarker) => void;
}

interface TooltipState {
  left: number;
  top: number;
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
}

const toChartTime = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1000) as UTCTimestamp;

const BINANCE_COLORS = {
  bg: "#161a1e",
  text: "#848e9c",
  textBright: "#eaecef",
  grid: "#1f2630",
  border: "#2b3139",
  up: "#0ecb81",
  down: "#f6465d",
  upWick: "#0ecb81",
  downWick: "#f6465d",
  volumeUp: "rgba(14, 203, 129, 0.25)",
  volumeDown: "rgba(246, 70, 93, 0.25)",
  crosshair: "#5a637a",
};

function formatPriceAuto(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatVol(vol: number): string {
  if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(2) + "M";
  if (vol >= 1_000) return (vol / 1_000).toFixed(1) + "K";
  return vol.toFixed(0);
}

export function CandlestickChart({
  candles,
  markers = [],
  showVolume = true,
  height = 360,
  onMarkerClick,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const hasFitRef = useRef(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const validCandles = useMemo(() => {
    return candles.filter((candle) => {
      return (
        Number.isFinite(candle.ts) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low &&
        candle.high >= candle.open &&
        candle.high >= candle.close &&
        candle.low <= candle.open &&
        candle.low <= candle.close
      );
    });
  }, [candles]);

  const candleData = useMemo<CandlestickData[]>(
    () =>
      validCandles.map((candle) => ({
        time: toChartTime(candle.ts),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [validCandles]
  );

  const volumeData = useMemo(() => {
    return validCandles.map((candle) => ({
      time: toChartTime(candle.ts),
      value: candle.volume,
      up: candle.close >= candle.open,
    }));
  }, [validCandles]);

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

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: BINANCE_COLORS.bg },
        textColor: BINANCE_COLORS.text,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: BINANCE_COLORS.grid, style: 1 },
        horzLines: { color: BINANCE_COLORS.grid, style: 1 },
      },
      rightPriceScale: {
        borderColor: BINANCE_COLORS.border,
        scaleMargins: { top: 0.05, bottom: showVolume ? 0.25 : 0.05 },
      },
      timeScale: {
        borderColor: BINANCE_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: BINANCE_COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: "#2b3139",
        },
        horzLine: {
          color: BINANCE_COLORS.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: "#2b3139",
        },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: BINANCE_COLORS.up,
      downColor: BINANCE_COLORS.down,
      borderVisible: false,
      wickUpColor: BINANCE_COLORS.upWick,
      wickDownColor: BINANCE_COLORS.downWick,
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

      const volSeries = volumeSeriesRef.current;
      const volData = volSeries ? param.seriesData.get(volSeries) as { value?: number } | undefined : undefined;
      const vol = volData?.value ?? 0;
      const isUp = ohlc.close >= ohlc.open;

      const rect = container.getBoundingClientRect();
      const tooltipWidth = 180;
      const tooltipHeight = 120;
      const left = Math.min(Math.max(param.point.x + 16, 8), rect.width - tooltipWidth - 8);
      const top = Math.min(Math.max(param.point.y - tooltipHeight - 16, 8), rect.height - tooltipHeight - 8);

      setTooltip({
        left,
        top,
        timeLabel: format(new Date(param.time * 1000), "dd MMM yyyy, HH:mm"),
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        volume: vol,
        isUp,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleContainerClick = (e: MouseEvent) => {
      if (!onMarkerClick) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const coordinate = chart.timeScale().coordinateToTime(x);
      if (coordinate) {
        const clickedTime = (coordinate as number) * 1000;
        const closestMarker = markers.reduce<{ marker: CandlestickMarker; distance: number } | null>((closest, marker) => {
          const distance = Math.abs(marker.time - clickedTime);
          if (!closest || distance < closest.distance) {
            return { marker, distance };
          }
          return closest;
        }, null);

        if (closestMarker && closestMarker.distance < 5 * 60 * 1000) {
          onMarkerClick(closestMarker.marker);
        }
      }
    };

    container.addEventListener("click", handleContainerClick);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      container.removeEventListener("click", handleContainerClick);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height, showVolume, markers, onMarkerClick]);

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
  }, [candleData]);

  useEffect(() => {
    const volumeSeries = volumeSeriesRef.current;
    if (!volumeSeries) return;

    volumeSeries.setData(
      volumeData.map((bar) => ({
        time: bar.time,
        value: bar.value,
        color: bar.up ? BINANCE_COLORS.volumeUp : BINANCE_COLORS.volumeDown,
      }))
    );
  }, [volumeData]);

  useEffect(() => {
    candleSeriesRef.current?.setMarkers(markerData);
  }, [markerData]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" data-testid="candlestick-chart" />
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none rounded border px-3 py-2 text-[11px] shadow-xl"
          style={{
            left: tooltip.left,
            top: tooltip.top,
            backgroundColor: "#1e2329",
            borderColor: "#2b3139",
            color: BINANCE_COLORS.text,
            minWidth: 170,
          }}
        >
          <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "#5e6673" }}>
            {tooltip.timeLabel}
          </div>
          <div className="grid grid-cols-[28px_1fr] gap-x-2 gap-y-0.5">
            <span>Open</span>
            <span className="tabular-nums text-right" style={{ color: BINANCE_COLORS.textBright }}>
              {formatPriceAuto(tooltip.open)}
            </span>
            <span>High</span>
            <span className="tabular-nums text-right" style={{ color: BINANCE_COLORS.up }}>
              {formatPriceAuto(tooltip.high)}
            </span>
            <span>Low</span>
            <span className="tabular-nums text-right" style={{ color: BINANCE_COLORS.down }}>
              {formatPriceAuto(tooltip.low)}
            </span>
            <span>Close</span>
            <span className="tabular-nums text-right" style={{ color: tooltip.isUp ? BINANCE_COLORS.up : BINANCE_COLORS.down }}>
              {formatPriceAuto(tooltip.close)}
            </span>
            {tooltip.volume > 0 && (
              <>
                <span>Vol</span>
                <span className="tabular-nums text-right" style={{ color: BINANCE_COLORS.textBright }}>
                  {formatVol(tooltip.volume)}
                </span>
              </>
            )}
          </div>
          <div
            className="mt-1.5 text-[10px] font-medium tabular-nums"
            style={{ color: tooltip.isUp ? BINANCE_COLORS.up : BINANCE_COLORS.down }}
          >
            {tooltip.isUp ? "▲" : "▼"}{" "}
            {((tooltip.close - tooltip.open) / tooltip.open * 100).toFixed(2)}%
          </div>
        </div>
      )}
    </div>
  );
}
