import { and, desc, eq } from "drizzle-orm";
import type {
  Candle,
  InsertSimEquitySnapshot,
  InsertSimPosition,
  InsertSimTrade,
  SimEquitySnapshot,
  SimPosition,
  SimTrade,
  Strategy,
  StrategyProfile,
} from "@shared/schema";
import {
  simEquitySnapshots,
  simPositions,
  simTrades,
  strategies,
  strategyProfiles,
} from "@shared/schema";
import type { StrategyConfig, StrategyMeta, StrategyProfileSlug, Timeframe } from "../strategies/types";
import type { Strategy as StrategyRuntime, StrategyEvent } from "../strategies/types";
import { createStrategy } from "../strategies/factory";
import { STRATEGY_PROFILE_CATALOG } from "../strategies/catalog";
import { loadCandles, alignToGrid } from "../marketData/loadCandles";
import { normalizeSymbol, timeframeToMs } from "../marketData/utils";
import { db } from "../db";

const USDT_MINOR_FACTOR = 1_000_000;

export interface SimTraderOptions {
  strategyId: string;
  profileSlug: string;
  initialEquityMinor?: string;
  snapshotIntervalMs?: number;
  exchange?: string;
  strategyConfigOverride?: StrategyConfig;
  strategyFactory?: (profileSlug: string, config: StrategyConfig, meta: StrategyMeta) => StrategyRuntime;
}

export interface SimTickResult {
  candle: Candle;
  driftedCandle: Candle;
  events: StrategyEvent[];
  position: SimPosition;
  tradesOpened: SimTrade[];
  tradesClosed: SimTrade[];
  equitySnapshot?: SimEquitySnapshot;
}

export interface SimTraderStore {
  getStrategy(strategyId: string): Promise<Strategy>;
  getProfile(slug: string): Promise<StrategyProfile | null>;
  getPosition(strategyId: string): Promise<SimPosition | null>;
  upsertPosition(input: InsertSimPosition, id?: string): Promise<SimPosition>;
  getOpenTrade(strategyId: string): Promise<SimTrade | null>;
  insertTrade(trade: InsertSimTrade): Promise<SimTrade>;
  updateTrade(id: string, updates: Partial<SimTrade>): Promise<SimTrade>;
  insertEquitySnapshot(snapshot: InsertSimEquitySnapshot): Promise<SimEquitySnapshot | undefined>;
}

export function createDbSimTraderStore(): SimTraderStore {
  return {
    async getStrategy(strategyId: string) {
      const [strategy] = await db.select().from(strategies).where(eq(strategies.id, strategyId));
      if (!strategy) {
        throw new Error(`Strategy not found: ${strategyId}`);
      }
      return strategy;
    },
    async getProfile(slug: string) {
      const [profile] = await db.select().from(strategyProfiles).where(eq(strategyProfiles.slug, slug));
      return profile ?? null;
    },
    async getPosition(strategyId: string) {
      const [position] = await db.select().from(simPositions).where(eq(simPositions.strategyId, strategyId));
      return position ?? null;
    },
    async upsertPosition(input: InsertSimPosition, id?: string) {
      if (id) {
        const [updated] = await db
          .update(simPositions)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(simPositions.id, id))
          .returning();
        if (!updated) {
          throw new Error(`Failed to update sim position: ${id}`);
        }
        return updated;
      }
      const [created] = await db
        .insert(simPositions)
        .values(input)
        .onConflictDoUpdate({
          target: simPositions.strategyId,
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      return created;
    },
    async getOpenTrade(strategyId: string) {
      const [trade] = await db
        .select()
        .from(simTrades)
        .where(and(eq(simTrades.strategyId, strategyId), eq(simTrades.status, "OPEN")))
        .orderBy(desc(simTrades.createdAt))
        .limit(1);
      return trade ?? null;
    },
    async insertTrade(trade: InsertSimTrade) {
      const [created] = await db.insert(simTrades).values(trade).returning();
      return created;
    },
    async updateTrade(id: string, updates: Partial<SimTrade>) {
      const [updated] = await db
        .update(simTrades)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(simTrades.id, id))
        .returning();
      if (!updated) {
        throw new Error(`Failed to update sim trade: ${id}`);
      }
      return updated;
    },
    async insertEquitySnapshot(snapshot: InsertSimEquitySnapshot) {
      const [created] = await db
        .insert(simEquitySnapshots)
        .values(snapshot)
        .onConflictDoNothing({
          target: [simEquitySnapshots.strategyId, simEquitySnapshots.ts],
        })
        .returning();
      return created;
    },
  };
}

export function computeDriftPerBar(monthlyBps: number, timeframe: Timeframe): number {
  const minutes =
    timeframe === "1m"
      ? 1
      : timeframe === "5m"
        ? 5
        : timeframe === "15m"
          ? 15
          : timeframe === "1h"
            ? 60
            : 1440;
  const barsPerMonth = Math.max(1, Math.round((30 * 24 * 60) / minutes));
  return (monthlyBps / 10_000) / barsPerMonth;
}

function formatDecimal(value: number, decimals = 8): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "");
}

function toMinor(value: number): string {
  return Math.round(value * USDT_MINOR_FACTOR).toString();
}

function fromMinor(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed / USDT_MINOR_FACTOR;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  const value = hashString(seed);
  return (value % 10_000) / 10_000;
}

function pickMonthlyDriftBps(strategyId: string, minBps: number, maxBps: number): number {
  const low = Math.min(minBps, maxBps);
  const high = Math.max(minBps, maxBps);
  if (low === high) return low;
  const seed = seededUnit(`${strategyId}:${low}:${high}`);
  return Math.round(low + seed * (high - low));
}

function applyDrift(candle: Candle, scale: number): Candle {
  return {
    ...candle,
    open: candle.open * scale,
    high: candle.high * scale,
    low: candle.low * scale,
    close: candle.close * scale,
  };
}

function resolveProfileDefaults(profileSlug: string): StrategyConfig {
  const catalogEntry = STRATEGY_PROFILE_CATALOG.find((profile) => profile.slug === profileSlug);
  if (!catalogEntry) {
    throw new Error(`Unknown strategy profile slug: ${profileSlug}`);
  }
  return catalogEntry.defaultConfig;
}

function defaultSnapshotIntervalMs(timeframe: Timeframe): number {
  const stepMs = timeframeToMs(timeframe);
  const hourlyMs = 60 * 60 * 1000;
  const barsPerHour = Math.max(1, Math.round(hourlyMs / stepMs));
  return barsPerHour * stepMs;
}

export class SimTrader {
  private readonly options: SimTraderOptions;
  private readonly store: SimTraderStore;
  private initialized = false;
  private strategyRecord!: Strategy;
  private profile!: StrategyProfile;
  private strategy!: StrategyRuntime;
  private driftBpsMonthly = 0;
  private driftScale = 1;
  private lastCandleTs: number | null = null;
  private lastSnapshotTs: number | null = null;
  private openTradeId: string | null = null;
  private snapshotIntervalMs = 0;

  constructor(options: SimTraderOptions, store: SimTraderStore = createDbSimTraderStore()) {
    this.options = options;
    this.store = store;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.strategyRecord = await this.store.getStrategy(this.options.strategyId);
    const profile = await this.store.getProfile(this.options.profileSlug);
    if (!profile) {
      const fallbackConfig = STRATEGY_PROFILE_CATALOG.find((item) => item.slug === this.options.profileSlug);
      if (!fallbackConfig) {
        throw new Error(`Strategy profile missing: ${this.options.profileSlug}`);
      }
      this.profile = {
        id: `profile-${this.options.profileSlug}`,
        slug: fallbackConfig.slug,
        displayName: fallbackConfig.displayName,
        symbol: fallbackConfig.symbol,
        timeframe: fallbackConfig.timeframe,
        description: fallbackConfig.description,
        riskLevel: fallbackConfig.riskLevel,
        tags: fallbackConfig.tags,
        defaultConfig: fallbackConfig.defaultConfig,
        configSchema: fallbackConfig.configSchema,
        isEnabled: fallbackConfig.isEnabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      this.profile = profile;
    }

    const config = this.options.strategyConfigOverride ?? resolveProfileDefaults(this.profile.slug);
    const strategyFactory = this.options.strategyFactory ?? ((slug, cfg, meta) => createStrategy(slug as StrategyProfileSlug, cfg, meta));
    this.strategy = strategyFactory(this.profile.slug, config, {
      symbol: this.profile.symbol,
      timeframe: this.profile.timeframe as Timeframe,
    });

    const existingPosition = await this.store.getPosition(this.strategyRecord.id);
    if (existingPosition) {
      this.driftScale = Number(existingPosition.driftScale) || 1;
      const minBps = this.strategyRecord.expectedMonthlyRangeBpsMin ?? 300;
      const maxBps = this.strategyRecord.expectedMonthlyRangeBpsMax ?? 600;
      const computedDrift = pickMonthlyDriftBps(this.strategyRecord.id, minBps, maxBps);
      this.driftBpsMonthly = existingPosition.driftBpsMonthly ?? computedDrift;
      if (this.driftBpsMonthly === 0 && (minBps !== 0 || maxBps !== 0)) {
        this.driftBpsMonthly = computedDrift;
      }
      this.lastCandleTs = existingPosition.lastCandleTs ?? null;
      this.lastSnapshotTs = existingPosition.lastSnapshotTs ?? null;
    } else {
      const minBps = this.strategyRecord.expectedMonthlyRangeBpsMin ?? 300;
      const maxBps = this.strategyRecord.expectedMonthlyRangeBpsMax ?? 600;
      this.driftBpsMonthly = pickMonthlyDriftBps(this.strategyRecord.id, minBps, maxBps);
      const initialEquityMinor = this.options.initialEquityMinor ?? toMinor(10_000);
      await this.store.upsertPosition({
        strategyId: this.strategyRecord.id,
        profileSlug: this.profile.slug,
        symbol: normalizeSymbol(this.profile.symbol),
        timeframe: this.profile.timeframe,
        status: "ACTIVE",
        cashMinor: initialEquityMinor,
        positionSide: "FLAT",
        positionQty: "0",
        positionEntryPrice: "0",
        equityMinor: initialEquityMinor,
        peakEquityMinor: initialEquityMinor,
        driftBpsMonthly: this.driftBpsMonthly,
        driftScale: "1",
      });
      this.driftScale = 1;
      this.lastCandleTs = null;
      this.lastSnapshotTs = null;
      this.strategy.reset();
    }

    const openTrade = await this.store.getOpenTrade(this.strategyRecord.id);
    this.openTradeId = openTrade?.id ?? null;
    this.snapshotIntervalMs = this.options.snapshotIntervalMs ?? defaultSnapshotIntervalMs(this.profile.timeframe as Timeframe);
    this.initialized = true;
  }

  async tick(): Promise<SimTickResult | null> {
    await this.init();
    const timeframe = this.profile.timeframe as Timeframe;
    const stepMs = timeframeToMs(timeframe);
    const nowAligned = alignToGrid(Date.now(), stepMs);
    const baseTs = this.lastCandleTs ?? (nowAligned - stepMs);
    const nextTs = baseTs + stepMs;

    if (nextTs > nowAligned) {
      return null;
    }

    const { candles } = await loadCandles({
      exchange: this.options.exchange ?? "sim",
      symbol: this.profile.symbol,
      timeframe,
      startMs: nextTs,
      endMs: nextTs + stepMs,
      allowLargeRange: true,
    });

    const candle = candles[0];
    if (!candle) {
      return null;
    }

    const driftPerBar = computeDriftPerBar(this.driftBpsMonthly, timeframe);
    const driftedCandle = applyDrift(candle, this.driftScale);
    this.driftScale = this.driftScale * (1 + driftPerBar);

    const events = this.strategy.onCandle(driftedCandle);
    const tradesOpened: SimTrade[] = [];
    const tradesClosed: SimTrade[] = [];
    let equitySnapshot: SimEquitySnapshot | undefined;

    const equityEvent = events.find((event) => event.payload.type === "equity");

    for (const event of events) {
      if (event.payload.type === "fill" && event.payload.data.side === "BUY") {
        const fill = event.payload.data;
        const created = await this.store.insertTrade({
          strategyId: this.strategyRecord.id,
          status: "OPEN",
          entryTs: event.ts,
          entryPrice: formatDecimal(fill.price),
          qty: formatDecimal(fill.qty),
          feesMinor: toMinor(fill.fees),
          reason: fill.reason,
        });
        this.openTradeId = created.id;
        tradesOpened.push(created);
      }

      if (event.payload.type === "trade") {
        const trade = event.payload.data;
        const openTrade = this.openTradeId ? await this.store.getOpenTrade(this.strategyRecord.id) : null;
        const combinedFees = trade.fees + fromMinor(openTrade?.feesMinor);
        const updatedTrade = openTrade && this.openTradeId
          ? await this.store.updateTrade(this.openTradeId, {
              status: "CLOSED",
              exitTs: event.ts,
              exitPrice: formatDecimal(trade.exitPrice),
              grossPnlMinor: toMinor(trade.grossPnl),
              netPnlMinor: toMinor(trade.netPnl),
              holdBars: trade.holdBars,
              reason: trade.reason,
              feesMinor: toMinor(combinedFees),
            })
          : null;

        if (updatedTrade) {
          tradesClosed.push(updatedTrade);
          this.openTradeId = null;
        } else {
          const fallback = await this.store.insertTrade({
            strategyId: this.strategyRecord.id,
            status: "CLOSED",
            entryTs: event.ts - trade.holdBars * stepMs,
            exitTs: event.ts,
            entryPrice: formatDecimal(trade.entryPrice),
            exitPrice: formatDecimal(trade.exitPrice),
            qty: formatDecimal(trade.qty),
            grossPnlMinor: toMinor(trade.grossPnl),
            netPnlMinor: toMinor(trade.netPnl),
            feesMinor: toMinor(trade.fees),
            holdBars: trade.holdBars,
            reason: trade.reason,
          });
          tradesClosed.push(fallback);
        }
      }
    }

    const state = this.strategy.getState();
    const positionValue = state.position.side === "LONG" ? state.position.qty * driftedCandle.close : 0;
    const equityMinor = toMinor(state.equity);
    const cashMinor = toMinor(state.cash);
    const previousPosition = await this.store.getPosition(this.strategyRecord.id);
    const previousPeak = fromMinor(previousPosition?.peakEquityMinor);
    const peakEquity = Math.max(state.equity, previousPeak);

    const positionPayload: InsertSimPosition = {
      strategyId: this.strategyRecord.id,
      profileSlug: this.profile.slug,
      symbol: normalizeSymbol(this.profile.symbol),
      timeframe: this.profile.timeframe,
      status: "ACTIVE",
      cashMinor,
      positionSide: state.position.side,
      positionQty: formatDecimal(state.position.qty),
      positionEntryPrice: formatDecimal(state.position.entryPrice),
      positionEntryTs: state.position.entryTs || null,
      equityMinor,
      peakEquityMinor: toMinor(peakEquity),
      lastCandleTs: candle.ts,
      lastSnapshotTs: this.lastSnapshotTs ?? null,
      driftBpsMonthly: this.driftBpsMonthly,
      driftScale: this.driftScale.toString(),
    };

    const updatedPosition = await this.store.upsertPosition(positionPayload, previousPosition?.id);

    this.lastCandleTs = candle.ts;

    const shouldSnapshot =
      this.lastSnapshotTs === null || candle.ts - this.lastSnapshotTs >= this.snapshotIntervalMs;

    if (shouldSnapshot) {
      const drawdownPct = equityEvent && equityEvent.payload.type === "equity"
        ? equityEvent.payload.data.drawdownPct
        : 0;
      equitySnapshot = await this.store.insertEquitySnapshot({
        strategyId: this.strategyRecord.id,
        ts: candle.ts,
        equityMinor,
        cashMinor,
        positionValueMinor: toMinor(positionValue),
        drawdownBps: Math.round(drawdownPct * 100),
      });
      if (equitySnapshot) {
        this.lastSnapshotTs = candle.ts;
        await this.store.upsertPosition(
          { ...positionPayload, lastSnapshotTs: candle.ts },
          updatedPosition.id
        );
      }
    }

    return {
      candle,
      driftedCandle,
      events,
      position: updatedPosition,
      tradesOpened,
      tradesClosed,
      equitySnapshot,
    };
  }

  async tickForward(bars: number): Promise<SimTickResult[]> {
    const results: SimTickResult[] = [];
    for (let i = 0; i < bars; i += 1) {
      const result = await this.tick();
      if (!result) break;
      results.push(result);
    }
    return results;
  }
}

export function createSimTrader(options: SimTraderOptions, store?: SimTraderStore): SimTrader {
  return new SimTrader(options, store);
}
