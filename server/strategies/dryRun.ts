import type { Candle } from "@shared/schema";
import type { StrategyConfig, StrategyEvent } from "./types";
import { createStrategy } from "./factory";

function generateSyntheticCandles(count: number, basePrice = 100, seed = 42): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  let prng = seed;

  function nextRandom(): number {
    prng = (prng * 1103515245 + 12345) & 0x7fffffff;
    return prng / 0x7fffffff;
  }

  const startTs = 1700000000000;

  for (let i = 0; i < count; i++) {
    const change = (nextRandom() - 0.5) * 0.04;
    const volatility = 0.02 + nextRandom() * 0.02;

    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + nextRandom() * volatility);
    const low = Math.min(open, close) * (1 - nextRandom() * volatility);
    const volume = 1000 + nextRandom() * 9000;

    candles.push({
      ts: startTs + i * 15 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}

function runDryTest(): void {
  console.log("=== Strategy Dry Run Test ===\n");

  const candles = generateSyntheticCandles(500, 50000, 42);
  console.log(`Generated ${candles.length} synthetic candles`);
  console.log(`Price range: ${candles[0].close.toFixed(2)} -> ${candles[candles.length - 1].close.toFixed(2)}\n`);

  const defaultConfig: StrategyConfig = {
    feesBps: 15,
    slippageBps: 10,
    maxPositionPct: 0.9,
    minBarsWarmup: 50,
    walkForward: {
      enabled: true,
      lookbackBars: 100,
      recalibEveryBars: 50,
      minWinProb: 0.45,
      minEVBps: 10,
    },
    oracleExit: {
      enabled: false,
      horizonBars: 12,
      penaltyBps: 50,
      maxHoldBars: 48,
    },
  };

  const profiles = [
    { slug: "btc_squeeze_breakout" as const, symbol: "BTCUSDT", oracleEnabled: true },
    { slug: "eth_ema_revert" as const, symbol: "ETHUSDT", oracleEnabled: false },
    { slug: "bnb_trend_pullback" as const, symbol: "BNBUSDT", oracleEnabled: false },
    { slug: "sol_vol_burst" as const, symbol: "SOLUSDT", oracleEnabled: false },
    { slug: "xrp_keltner_revert" as const, symbol: "XRPUSDT", oracleEnabled: false },
    { slug: "doge_fast_momo" as const, symbol: "DOGEUSDT", oracleEnabled: false },
    { slug: "ada_deep_revert" as const, symbol: "ADAUSDT", oracleEnabled: false },
    { slug: "trx_lowvol_band" as const, symbol: "TRXUSDT", oracleEnabled: false },
  ];

  for (const profile of profiles) {
    const config: StrategyConfig = {
      ...defaultConfig,
      oracleExit: {
        ...defaultConfig.oracleExit,
        enabled: profile.oracleEnabled,
      },
    };

    const strategy = createStrategy(profile.slug, config, {
      symbol: profile.symbol,
      timeframe: "15m",
    });

    const allEvents: StrategyEvent[] = [];

    for (let i = 0; i < candles.length; i++) {
      const futureCandles = profile.oracleEnabled ? candles.slice(i + 1, i + 13) : undefined;
      const events = strategy.onCandle(candles[i], futureCandles);
      allEvents.push(...events);
    }

    const state = strategy.getState();
    const signals = allEvents.filter((e) => e.payload.type === "signal");
    const trades = allEvents.filter((e) => e.payload.type === "trade");
    const orders = allEvents.filter((e) => e.payload.type === "order");

    console.log(`--- ${profile.slug.toUpperCase()} ---`);
    console.log(`  Signals: ${signals.length}`);
    console.log(`  Orders: ${orders.length}`);
    console.log(`  Trades: ${trades.length}`);
    console.log(`  Final equity: $${state.equity.toFixed(2)}`);
    console.log(`  Net PnL: $${state.stats.netPnl.toFixed(2)}`);
    console.log(`  Win rate: ${state.stats.totalTrades > 0 ? ((state.stats.wins / state.stats.totalTrades) * 100).toFixed(1) : 0}%`);
    console.log(`  Total fees: $${state.stats.fees.toFixed(2)}`);

    if (trades.length > 0) {
      const firstTrade = trades[0];
      if (firstTrade.payload.type === "trade") {
        console.log(`  First trade reason: ${firstTrade.payload.data.reason}`);
      }
    }

    console.log("");

    const run1Events = runDeterminismCheck(profile.slug, config, profile.symbol, candles, profile.oracleEnabled);
    const run2Events = runDeterminismCheck(profile.slug, config, profile.symbol, candles, profile.oracleEnabled);

    const isDeterministic =
      run1Events.length === run2Events.length &&
      run1Events.every((e, i) => JSON.stringify(e) === JSON.stringify(run2Events[i]));

    console.log(`  Determinism check: ${isDeterministic ? "PASS" : "FAIL"} (${run1Events.length} events)\n`);
  }
}

function runDeterminismCheck(
  slug: "btc_squeeze_breakout" | "eth_ema_revert" | "bnb_trend_pullback" | "sol_vol_burst" | "xrp_keltner_revert" | "doge_fast_momo" | "ada_deep_revert" | "trx_lowvol_band",
  config: StrategyConfig,
  symbol: string,
  candles: Candle[],
  oracleEnabled: boolean
): StrategyEvent[] {
  const strategy = createStrategy(slug, config, { symbol, timeframe: "15m" });
  const events: StrategyEvent[] = [];

  for (let i = 0; i < candles.length; i++) {
    const futureCandles = oracleEnabled ? candles.slice(i + 1, i + 13) : undefined;
    events.push(...strategy.onCandle(candles[i], futureCandles));
  }

  return events;
}

runDryTest();
