import { storage } from "../storage";

const DEFAULT_LAG_MS = 900_000;
const DEFAULT_SPEED = 1;
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

let initialized = false;
let simStartMs = 0;
let realStartMs = 0;
let simSpeed = DEFAULT_SPEED;
let simLagMs = DEFAULT_LAG_MS;

const simEnabled = process.env.SIM_ENABLED !== "0";

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

async function initClock(): Promise<void> {
  if (initialized) return;

  simSpeed = Math.max(0.1, parseNumber(process.env.SIM_SPEED, DEFAULT_SPEED));
  simLagMs = Math.max(60_000, parseNumber(process.env.SIM_LAG_MS, DEFAULT_LAG_MS));

  const envStart = process.env.SIM_START_TS ? Number(process.env.SIM_START_TS) : NaN;
  let baseStart = Number.isFinite(envStart) ? envStart : 0;

  if (!baseStart) {
    try {
      const bounds = await storage.getMarketCandleBounds();
      if (bounds.maxTs) {
        baseStart = bounds.maxTs - DEFAULT_LOOKBACK_MS;
        if (bounds.minTs && baseStart < bounds.minTs) {
          baseStart = bounds.minTs;
        }
      } else {
        baseStart = Date.now() - DEFAULT_LOOKBACK_MS;
      }
    } catch (error) {
      console.warn("[replayClock] failed to read candle bounds, using fallback", error);
      baseStart = Date.now() - DEFAULT_LOOKBACK_MS;
    }
  }

  simStartMs = Math.max(0, baseStart);
  realStartMs = Date.now();
  initialized = true;
}

export async function ensureReplayClock(): Promise<void> {
  await initClock();
}

export function isSimEnabled(): boolean {
  return simEnabled;
}

export function getSimStartMs(): number {
  return simStartMs;
}

export function getSimSpeed(): number {
  return simSpeed;
}

export function getSimLagMs(): number {
  return simLagMs;
}

export function getSimNow(): number {
  if (!simEnabled || !initialized) {
    return Date.now();
  }
  const elapsed = Date.now() - realStartMs;
  return simStartMs + elapsed * simSpeed;
}

export function getDecisionNow(lagOverrideMs?: number): number {
  const lag = Number.isFinite(lagOverrideMs) ? (lagOverrideMs as number) : simLagMs;
  return getSimNow() - lag;
}
