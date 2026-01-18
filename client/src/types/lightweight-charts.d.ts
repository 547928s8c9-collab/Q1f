declare module "lightweight-charts" {
  export type UTCTimestamp = number;

  export type CandlestickData = {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
  };

  export type SeriesMarker<TTime = UTCTimestamp> = {
    time: TTime;
    position: "aboveBar" | "belowBar" | "inBar";
    color: string;
    shape: "arrowUp" | "arrowDown" | "circle";
    text?: string;
  };

  export type ISeriesApi<TSeriesType extends string = string> = {
    setData(data: Array<Record<string, unknown>>): void;
    setMarkers(markers: Array<SeriesMarker<UTCTimestamp>>): void;
    applyOptions(options: Record<string, unknown>): void;
  };

  export type IChartApi = {
    addCandlestickSeries(options?: Record<string, unknown>): ISeriesApi<"Candlestick">;
    addHistogramSeries(options?: Record<string, unknown>): ISeriesApi<"Histogram">;
    applyOptions(options: Record<string, unknown>): void;
    priceScale(id: string): { applyOptions(options: Record<string, unknown>): void };
    timeScale(): {
      fitContent(): void;
      scrollToPosition(position: number, animated: boolean): void;
      scrollToRealTime(): void;
    };
    subscribeCrosshairMove(handler: (param: {
      time?: UTCTimestamp;
      point?: { x: number; y: number };
      seriesData: Map<unknown, unknown>;
    }) => void): void;
    unsubscribeCrosshairMove(handler: (param: {
      time?: UTCTimestamp;
      point?: { x: number; y: number };
      seriesData: Map<unknown, unknown>;
    }) => void): void;
    remove(): void;
  };

  export const ColorType: {
    Solid: number;
  };
  export const CrosshairMode: {
    Normal: number;
  };

  export function createChart(container: HTMLElement, options: Record<string, unknown>): IChartApi;
}
