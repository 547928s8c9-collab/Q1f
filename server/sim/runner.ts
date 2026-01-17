import type { Candle, SimSession, SimSessionStatusType, StrategyProfileConfig, SimSessionModeType } from "@shared/schema";
import { SimSessionStatus, SimSessionMode } from "@shared/schema";
import type { StrategyEvent, StrategyConfig, Timeframe } from "../strategies/types";
import { createStrategy } from "../strategies/factory";
import { loadCandles } from "../marketData/loadCandles";
import { EventEmitter } from "events";
import { storage } from "../storage";
import { ensureReplayClock, getDecisionNow } from "../market/replayClock";

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
  cursorMs: number;
  isPaused: boolean;
  isStopped: boolean;
  tickTimer: ReturnType<typeof setTimeout> | null;
  mode: SimSessionModeType;
}

const CANDLE_BATCH_SIZE = 100;

function timeframeToMs(tf: Timeframe): number {
  const map: Record<Timeframe, number> = {
    "1m": 60_000,
    "15m": 900_000,
    "1h": 3_600_000,
  };
  return map[tf] || 900_000;
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
    const tfMs = timeframeToMs(timeframe);
    const mode = (session.mode as SimSessionModeType) || SimSessionMode.REPLAY;

    if (mode === SimSessionMode.LAGGED_LIVE && config.oracleExit) {
      config.oracleExit = { ...config.oracleExit, enabled: false };
    }

    const initialCursorMs = session.cursorMs ?? session.startMs;

    let fetchEndMs: number;
    if (mode === SimSessionMode.LAGGED_LIVE) {
      await ensureReplayClock();
      fetchEndMs = getDecisionNow(session.lagMs || 900_000);
    } else {
      fetchEndMs = session.endMs ?? (session.startMs + tfMs * CANDLE_BATCH_SIZE);
    }

    let candles: Candle[];
    try {
      const result = await loadCandles({
        symbol: session.symbol,
        timeframe,
        startMs: initialCursorMs,
        endMs: Math.min(fetchEndMs, initialCursorMs + tfMs * CANDLE_BATCH_SIZE),
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

    const lastSeq = await storage.getLastSimEventSeq(session.id);

    const state: RunnerState = {
      session,
      candles,
      candleIndex: 0,
      strategy,
      config,
      seq: lastSeq,
      cursorMs: initialCursorMs,
      isPaused: false,
      isStopped: false,
      tickTimer: null,
      mode,
    };

    this.runners.set(session.id, state);

    await this.onStatusChangeCallback?.(session.id, SimSessionStatus.RUNNING);
    this.emit("statusChange", session.id, SimSessionStatus.RUNNING);

    this.scheduleTick(session.id);

    return { success: true };
  }

  private getTickInterval(state: RunnerState): number {
    if (state.mode === SimSessionMode.REPLAY) {
      return state.session.replayMsPerCandle || 15000;
    }
    return Math.max(10, 1000 / state.session.speed);
  }

  private scheduleTick(sessionId: string) {
    const state = this.runners.get(sessionId);
    if (!state || state.isStopped || state.isPaused) return;

    const tickIntervalMs = this.getTickInterval(state);

    state.tickTimer = setTimeout(() => {
      this.processTick(sessionId);
    }, tickIntervalMs);
  }

  private async processTick(sessionId: string) {
    const state = this.runners.get(sessionId);
    if (!state || state.isStopped || state.isPaused) return;

    const timeframe = state.session.timeframe as Timeframe;
    const tfMs = timeframeToMs(timeframe);

    if (state.candleIndex >= state.candles.length) {
      const needsMoreCandles = await this.loadMoreCandles(state);
      if (!needsMoreCandles) {
        if (state.mode === SimSessionMode.LAGGED_LIVE) {
          this.scheduleTick(sessionId);
          return;
        }
        await this.onStatusChangeCallback?.(sessionId, SimSessionStatus.FINISHED);
        this.emit("statusChange", sessionId, SimSessionStatus.FINISHED);
        this.cleanup(sessionId);
        return;
      }
    }

    const candle = state.candles[state.candleIndex];
    const futureCandles = state.mode === SimSessionMode.REPLAY && state.config.oracleExit.enabled
      ? state.candles.slice(state.candleIndex + 1, state.candleIndex + state.config.oracleExit.horizonBars + 1)
      : undefined;

    const events = state.strategy!.onCandle(candle, futureCandles);

    for (const event of events) {
      if (event.payload.type === "trade" && typeof event.payload.data === "object" && event.payload.data !== null) {
        (event.payload.data as { symbol?: string }).symbol = state.session.symbol;
      }

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
    state.cursorMs = candle.ts + tfMs;

    await storage.updateSimSession(sessionId, { 
      cursorMs: state.cursorMs,
      lastSeq: state.seq,
    });

    this.scheduleTick(sessionId);
  }

  private async loadMoreCandles(state: RunnerState): Promise<boolean> {
    const timeframe = state.session.timeframe as Timeframe;
    const tfMs = timeframeToMs(timeframe);

    let fetchEndMs: number;
    if (state.mode === SimSessionMode.LAGGED_LIVE) {
      await ensureReplayClock();
      fetchEndMs = getDecisionNow(state.session.lagMs || 900_000);
    } else {
      if (state.session.endMs && state.cursorMs >= state.session.endMs) {
        return false;
      }
      fetchEndMs = state.session.endMs ?? state.cursorMs + tfMs * CANDLE_BATCH_SIZE;
    }

    if (state.cursorMs >= fetchEndMs) {
      return false;
    }

    try {
      const result = await loadCandles({
        symbol: state.session.symbol,
        timeframe,
        startMs: state.cursorMs,
        endMs: Math.min(fetchEndMs, state.cursorMs + tfMs * CANDLE_BATCH_SIZE),
      });

      if (result.candles.length === 0) {
        return false;
      }

      state.candles = result.candles;
      state.candleIndex = 0;
      return true;
    } catch {
      return false;
    }
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

  getState(sessionId: string): { candleIndex: number; totalCandles: number; seq: number; cursorMs: number } | null {
    const state = this.runners.get(sessionId);
    if (!state) return null;
    return {
      candleIndex: state.candleIndex,
      totalCandles: state.candles.length,
      seq: state.seq,
      cursorMs: state.cursorMs,
    };
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.runners.keys());
  }

  stopAll(): void {
    for (const sessionId of this.runners.keys()) {
      this.stop(sessionId);
    }
  }
}

export const sessionRunner = new SessionRunnerManager();
