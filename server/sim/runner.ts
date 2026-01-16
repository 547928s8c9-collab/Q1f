import type { Candle, SimSession, SimSessionStatusType, StrategyProfileConfig } from "@shared/schema";
import { SimSessionStatus } from "@shared/schema";
import type { StrategyEvent, StrategyConfig, Timeframe } from "../strategies/types";
import { createStrategy } from "../strategies/factory";
import { loadCandles } from "../marketData/loadCandles";
import { EventEmitter } from "events";

export interface SessionRunnerEvents {
  event: (sessionId: string, event: SimEventData) => void;
  statusChange: (sessionId: string, status: SimSessionStatusType) => void;
  error: (sessionId: string, error: string) => void;
}

export interface SimEventData {
  seq: number;
  ts: number;
  type: string;
  payload: unknown;
}

interface RunnerState {
  session: SimSession;
  candles: Candle[];
  candleIndex: number;
  strategy: ReturnType<typeof createStrategy> | null;
  config: StrategyConfig;
  seq: number;
  isPaused: boolean;
  isStopped: boolean;
  tickTimer: ReturnType<typeof setTimeout> | null;
}

class SessionRunnerManager extends EventEmitter {
  private runners: Map<string, RunnerState> = new Map();
  private onEventCallback: ((sessionId: string, event: SimEventData) => Promise<void>) | null = null;
  private onStatusChangeCallback: ((sessionId: string, status: SimSessionStatusType, errorMessage?: string) => Promise<void>) | null = null;

  setEventCallback(cb: (sessionId: string, event: SimEventData) => Promise<void>) {
    this.onEventCallback = cb;
  }

  setStatusChangeCallback(cb: (sessionId: string, status: SimSessionStatusType, errorMessage?: string) => Promise<void>) {
    this.onStatusChangeCallback = cb;
  }

  async startSession(
    session: SimSession,
    defaultConfig: StrategyProfileConfig
  ): Promise<{ success: boolean; error?: string }> {
    if (this.runners.has(session.id)) {
      return { success: false, error: "Session already running" };
    }

    const config: StrategyConfig = {
      ...defaultConfig,
      ...(session.configOverrides || {}),
    };

    const timeframe = session.timeframe as Timeframe;

    let candles: Candle[];
    try {
      const result = await loadCandles({
        symbol: session.symbol,
        timeframe,
        startMs: session.startMs,
        endMs: session.endMs,
      });
      
      if (result.gaps && result.gaps.length > 0) {
        const errorMessage = `Data gaps detected: ${result.gaps.length} gaps found`;
        await this.onStatusChangeCallback?.(session.id, SimSessionStatus.FAILED, errorMessage);
        this.emit("statusChange", session.id, SimSessionStatus.FAILED);
        return { success: false, error: errorMessage };
      }

      candles = result.candles;
      
      if (candles.length < config.minBarsWarmup + 10) {
        const errorMessage = `Insufficient candles: ${candles.length} < ${config.minBarsWarmup + 10} required`;
        await this.onStatusChangeCallback?.(session.id, SimSessionStatus.FAILED, errorMessage);
        this.emit("statusChange", session.id, SimSessionStatus.FAILED);
        return { success: false, error: errorMessage };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load candles";
      await this.onStatusChangeCallback?.(session.id, SimSessionStatus.FAILED, errorMessage);
      this.emit("statusChange", session.id, SimSessionStatus.FAILED);
      return { success: false, error: errorMessage };
    }

    const strategy = createStrategy(
      session.profileSlug as any,
      config,
      { symbol: session.symbol, timeframe }
    );

    const state: RunnerState = {
      session,
      candles,
      candleIndex: 0,
      strategy,
      config,
      seq: session.lastSeq || 0,
      isPaused: false,
      isStopped: false,
      tickTimer: null,
    };

    this.runners.set(session.id, state);

    await this.onStatusChangeCallback?.(session.id, SimSessionStatus.RUNNING);
    this.emit("statusChange", session.id, SimSessionStatus.RUNNING);

    this.scheduleTick(session.id);

    return { success: true };
  }

  private scheduleTick(sessionId: string) {
    const state = this.runners.get(sessionId);
    if (!state || state.isStopped || state.isPaused) return;

    const tickIntervalMs = Math.max(10, 1000 / state.session.speed);

    state.tickTimer = setTimeout(() => {
      this.processTick(sessionId);
    }, tickIntervalMs);
  }

  private async processTick(sessionId: string) {
    const state = this.runners.get(sessionId);
    if (!state || state.isStopped || state.isPaused) return;

    if (state.candleIndex >= state.candles.length) {
      await this.onStatusChangeCallback?.(sessionId, SimSessionStatus.FINISHED);
      this.emit("statusChange", sessionId, SimSessionStatus.FINISHED);
      this.cleanup(sessionId);
      return;
    }

    const candle = state.candles[state.candleIndex];
    const futureCandles = state.config.oracleExit.enabled
      ? state.candles.slice(state.candleIndex + 1, state.candleIndex + state.config.oracleExit.horizonBars + 1)
      : undefined;

    const events = state.strategy!.onCandle(candle, futureCandles);

    for (const event of events) {
      state.seq++;
      const simEvent: SimEventData = {
        seq: state.seq,
        ts: event.ts,
        type: event.payload.type,
        payload: event.payload,
      };

      await this.onEventCallback?.(sessionId, simEvent);
      this.emit("event", sessionId, simEvent);
    }

    state.candleIndex++;

    this.scheduleTick(sessionId);
  }

  pause(sessionId: string): boolean {
    const state = this.runners.get(sessionId);
    if (!state || state.isStopped) return false;

    state.isPaused = true;
    if (state.tickTimer) {
      clearTimeout(state.tickTimer);
      state.tickTimer = null;
    }

    this.onStatusChangeCallback?.(sessionId, SimSessionStatus.PAUSED);
    this.emit("statusChange", sessionId, SimSessionStatus.PAUSED);
    return true;
  }

  resume(sessionId: string): boolean {
    const state = this.runners.get(sessionId);
    if (!state || state.isStopped || !state.isPaused) return false;

    state.isPaused = false;
    this.onStatusChangeCallback?.(sessionId, SimSessionStatus.RUNNING);
    this.emit("statusChange", sessionId, SimSessionStatus.RUNNING);
    this.scheduleTick(sessionId);
    return true;
  }

  stop(sessionId: string): boolean {
    const state = this.runners.get(sessionId);
    if (!state) return false;

    state.isStopped = true;
    if (state.tickTimer) {
      clearTimeout(state.tickTimer);
      state.tickTimer = null;
    }

    this.onStatusChangeCallback?.(sessionId, SimSessionStatus.STOPPED);
    this.emit("statusChange", sessionId, SimSessionStatus.STOPPED);
    this.cleanup(sessionId);
    return true;
  }

  private cleanup(sessionId: string) {
    const state = this.runners.get(sessionId);
    if (state?.tickTimer) {
      clearTimeout(state.tickTimer);
    }
    this.runners.delete(sessionId);
  }

  isRunning(sessionId: string): boolean {
    return this.runners.has(sessionId);
  }

  getState(sessionId: string): { candleIndex: number; totalCandles: number; seq: number } | null {
    const state = this.runners.get(sessionId);
    if (!state) return null;
    return {
      candleIndex: state.candleIndex,
      totalCandles: state.candles.length,
      seq: state.seq,
    };
  }
}

export const sessionRunner = new SessionRunnerManager();
