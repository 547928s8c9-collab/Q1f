export interface StreamingIndicator<T> {
  update(value: number): T;
  getValue(): T;
  isReady(): boolean;
  reset(): void;
}

export class SMA implements StreamingIndicator<number> {
  private period: number;
  private buffer: number[] = [];
  private sum = 0;

  constructor(period: number) {
    this.period = period;
  }

  update(value: number): number {
    this.buffer.push(value);
    this.sum += value;

    if (this.buffer.length > this.period) {
      this.sum -= this.buffer.shift()!;
    }

    return this.getValue();
  }

  getValue(): number {
    if (this.buffer.length === 0) return 0;
    return this.sum / this.buffer.length;
  }

  isReady(): boolean {
    return this.buffer.length >= this.period;
  }

  reset(): void {
    this.buffer = [];
    this.sum = 0;
  }
}

export class EMA implements StreamingIndicator<number> {
  private period: number;
  private multiplier: number;
  private value: number | null = null;
  private count = 0;

  constructor(period: number) {
    this.period = period;
    this.multiplier = 2 / (period + 1);
  }

  update(price: number): number {
    this.count++;
    if (this.value === null) {
      this.value = price;
    } else {
      this.value = (price - this.value) * this.multiplier + this.value;
    }
    return this.value;
  }

  getValue(): number {
    return this.value ?? 0;
  }

  isReady(): boolean {
    return this.count >= this.period;
  }

  reset(): void {
    this.value = null;
    this.count = 0;
  }
}

export class RSI implements StreamingIndicator<number> {
  private period: number;
  private prevPrice: number | null = null;
  private avgGain = 0;
  private avgLoss = 0;
  private count = 0;

  constructor(period: number = 14) {
    this.period = period;
  }

  update(price: number): number {
    if (this.prevPrice === null) {
      this.prevPrice = price;
      return 50;
    }

    const change = price - this.prevPrice;
    this.prevPrice = price;

    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    this.count++;

    if (this.count <= this.period) {
      this.avgGain = (this.avgGain * (this.count - 1) + gain) / this.count;
      this.avgLoss = (this.avgLoss * (this.count - 1) + loss) / this.count;
    } else {
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }

    return this.getValue();
  }

  getValue(): number {
    if (this.avgLoss === 0) return 100;
    const rs = this.avgGain / this.avgLoss;
    return 100 - 100 / (1 + rs);
  }

  isReady(): boolean {
    return this.count >= this.period;
  }

  reset(): void {
    this.prevPrice = null;
    this.avgGain = 0;
    this.avgLoss = 0;
    this.count = 0;
  }
}

export interface BollingerResult {
  middle: number;
  upper: number;
  lower: number;
  bandwidth: number;
  percentB: number;
}

export class BollingerBands implements StreamingIndicator<BollingerResult> {
  private period: number;
  private stdDevMultiplier: number;
  private buffer: number[] = [];
  private sma: SMA;

  constructor(period: number = 20, stdDevMultiplier: number = 2) {
    this.period = period;
    this.stdDevMultiplier = stdDevMultiplier;
    this.sma = new SMA(period);
  }

  update(price: number): BollingerResult {
    this.buffer.push(price);
    if (this.buffer.length > this.period) {
      this.buffer.shift();
    }
    this.sma.update(price);
    return this.getValue();
  }

  getValue(): BollingerResult {
    const middle = this.sma.getValue();

    if (this.buffer.length < 2) {
      return { middle, upper: middle, lower: middle, bandwidth: 0, percentB: 0.5 };
    }

    const variance =
      this.buffer.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) /
      this.buffer.length;
    const stdDev = Math.sqrt(variance);

    const upper = middle + this.stdDevMultiplier * stdDev;
    const lower = middle - this.stdDevMultiplier * stdDev;
    const bandwidth = middle > 0 ? (upper - lower) / middle : 0;
    const range = upper - lower;
    const percentB = range > 0 ? (this.buffer[this.buffer.length - 1] - lower) / range : 0.5;

    return { middle, upper, lower, bandwidth, percentB };
  }

  isReady(): boolean {
    return this.buffer.length >= this.period;
  }

  reset(): void {
    this.buffer = [];
    this.sma.reset();
  }
}

export class ATR implements StreamingIndicator<number> {
  private period: number;
  private prevClose: number | null = null;
  private atr: number | null = null;
  private count = 0;

  constructor(period: number = 14) {
    this.period = period;
  }

  updateHLC(high: number, low: number, close: number): number {
    let tr: number;

    if (this.prevClose === null) {
      tr = high - low;
    } else {
      tr = Math.max(high - low, Math.abs(high - this.prevClose), Math.abs(low - this.prevClose));
    }

    this.prevClose = close;
    this.count++;

    if (this.atr === null) {
      this.atr = tr;
    } else {
      this.atr = (this.atr * (this.period - 1) + tr) / this.period;
    }

    return this.atr;
  }

  update(_value: number): number {
    throw new Error("Use updateHLC for ATR");
  }

  getValue(): number {
    return this.atr ?? 0;
  }

  isReady(): boolean {
    return this.count >= this.period;
  }

  reset(): void {
    this.prevClose = null;
    this.atr = null;
    this.count = 0;
  }
}

export interface KeltnerResult {
  middle: number;
  upper: number;
  lower: number;
}

export class KeltnerChannel implements StreamingIndicator<KeltnerResult> {
  private ema: EMA;
  private atr: ATR;
  private multiplier: number;

  constructor(emaPeriod: number = 20, atrPeriod: number = 10, multiplier: number = 2) {
    this.ema = new EMA(emaPeriod);
    this.atr = new ATR(atrPeriod);
    this.multiplier = multiplier;
  }

  updateHLC(high: number, low: number, close: number): KeltnerResult {
    this.ema.update(close);
    this.atr.updateHLC(high, low, close);
    return this.getValue();
  }

  update(_value: number): KeltnerResult {
    throw new Error("Use updateHLC for KeltnerChannel");
  }

  getValue(): KeltnerResult {
    const middle = this.ema.getValue();
    const atr = this.atr.getValue();
    return {
      middle,
      upper: middle + this.multiplier * atr,
      lower: middle - this.multiplier * atr,
    };
  }

  isReady(): boolean {
    return this.ema.isReady() && this.atr.isReady();
  }

  reset(): void {
    this.ema.reset();
    this.atr.reset();
  }
}

export class ReturnPercentile implements StreamingIndicator<number> {
  private period: number;
  private buffer: number[] = [];
  private prevPrice: number | null = null;

  constructor(period: number = 100) {
    this.period = period;
  }

  update(price: number): number {
    if (this.prevPrice === null) {
      this.prevPrice = price;
      return 0.5;
    }

    const ret = (price - this.prevPrice) / this.prevPrice;
    this.prevPrice = price;

    this.buffer.push(ret);
    if (this.buffer.length > this.period) {
      this.buffer.shift();
    }

    return this.getValue();
  }

  getValue(): number {
    if (this.buffer.length < 2) return 0.5;

    const currentReturn = this.buffer[this.buffer.length - 1];
    const sorted = [...this.buffer].sort((a, b) => a - b);
    const rank = sorted.findIndex((r) => r >= currentReturn);

    return rank / (sorted.length - 1);
  }

  isReady(): boolean {
    return this.buffer.length >= this.period;
  }

  reset(): void {
    this.buffer = [];
    this.prevPrice = null;
  }
}

export class VolumeMA implements StreamingIndicator<number> {
  private sma: SMA;

  constructor(period: number = 20) {
    this.sma = new SMA(period);
  }

  update(volume: number): number {
    return this.sma.update(volume);
  }

  getValue(): number {
    return this.sma.getValue();
  }

  isReady(): boolean {
    return this.sma.isReady();
  }

  reset(): void {
    this.sma.reset();
  }

  getRelativeVolume(currentVolume: number): number {
    const avg = this.getValue();
    if (avg === 0) return 1;
    return currentVolume / avg;
  }
}

export class Slope implements StreamingIndicator<number> {
  private period: number;
  private buffer: number[] = [];

  constructor(period: number = 5) {
    this.period = period;
  }

  update(value: number): number {
    this.buffer.push(value);
    if (this.buffer.length > this.period) {
      this.buffer.shift();
    }
    return this.getValue();
  }

  getValue(): number {
    if (this.buffer.length < 2) return 0;

    const n = this.buffer.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += this.buffer[i];
      sumXY += i * this.buffer[i];
      sumX2 += i * i;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  isReady(): boolean {
    return this.buffer.length >= this.period;
  }

  reset(): void {
    this.buffer = [];
  }
}
