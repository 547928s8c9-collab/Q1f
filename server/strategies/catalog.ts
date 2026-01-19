import type { StrategyConfig, StrategyProfileSlug } from "./types";

export const VALID_STRATEGY_RISK_LEVELS = ["LOW", "CORE", "HIGH"] as const;
export type StrategyRiskLevel = typeof VALID_STRATEGY_RISK_LEVELS[number];

export interface StrategyProfileCatalogEntry {
  slug: StrategyProfileSlug;
  displayName: string;
  symbol: string;
  timeframe: "15m" | "1h" | "1d";
  description: string;
  riskLevel: StrategyRiskLevel;
  tags: string[];
  defaultConfig: StrategyConfig;
  configSchema: Record<string, unknown>;
  isEnabled: boolean;
}

export interface StrategyCatalogEntry {
  name: string;
  description: string;
  riskTier: StrategyRiskLevel;
  baseAsset: string;
  pairsJson: string[];
  expectedMonthlyRangeBpsMin: number;
  expectedMonthlyRangeBpsMax: number;
  feesJson: { management: string; performance: string };
  termsJson: { profitPayout: string; principalRedemption: string };
  minInvestment: string;
  worstMonth: string;
  maxDrawdown: string;
  isActive: boolean;
}

const baseConfig: StrategyConfig = {
  feesBps: 12,
  slippageBps: 8,
  maxPositionPct: 0.85,
  minBarsWarmup: 200,
  walkForward: {
    enabled: true,
    lookbackBars: 200,
    recalibEveryBars: 60,
    minWinProb: 0.48,
    minEVBps: 8,
  },
  oracleExit: {
    enabled: false,
    horizonBars: 12,
    penaltyBps: 40,
    maxHoldBars: 48,
  },
};

const baseConfigSchema = {
  type: "object",
  required: ["feesBps", "slippageBps", "maxPositionPct", "minBarsWarmup", "walkForward", "oracleExit"],
  properties: {
    feesBps: { type: "number", minimum: 0, maximum: 50 },
    slippageBps: { type: "number", minimum: 0, maximum: 50 },
    maxPositionPct: { type: "number", minimum: 0.1, maximum: 1 },
    minBarsWarmup: { type: "number", minimum: 50, maximum: 500 },
    walkForward: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        lookbackBars: { type: "number", minimum: 50, maximum: 500 },
        recalibEveryBars: { type: "number", minimum: 10, maximum: 200 },
        minWinProb: { type: "number", minimum: 0, maximum: 1 },
        minEVBps: { type: "number", minimum: 0, maximum: 50 },
      },
    },
    oracleExit: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        horizonBars: { type: "number", minimum: 3, maximum: 48 },
        penaltyBps: { type: "number", minimum: 0, maximum: 100 },
        maxHoldBars: { type: "number", minimum: 12, maximum: 200 },
      },
    },
  },
};

export const STRATEGY_PROFILE_CATALOG: StrategyProfileCatalogEntry[] = [
  {
    slug: "btc_squeeze_breakout",
    displayName: "BTC Squeeze Breakout",
    symbol: "BTCUSDT",
    timeframe: "15m",
    description: "Breakout-focused BTC strategy using volatility squeeze + volume confirmation.",
    riskLevel: "HIGH",
    tags: ["breakout", "volatility", "volume"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 14,
      slippageBps: 10,
      oracleExit: {
        ...baseConfig.oracleExit,
        enabled: true,
        horizonBars: 12,
        penaltyBps: 45,
        maxHoldBars: 60,
      },
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "eth_ema_revert",
    displayName: "ETH EMA Revert",
    symbol: "ETHUSDT",
    timeframe: "15m",
    description: "Mean reversion on ETH using EMA stretch/return dynamics.",
    riskLevel: "CORE",
    tags: ["mean-reversion", "ema", "trend"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 12,
      slippageBps: 8,
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "bnb_trend_pullback",
    displayName: "BNB Trend Pullback",
    symbol: "BNBUSDT",
    timeframe: "15m",
    description: "Trend-following BNB entries on pullbacks to fast moving averages.",
    riskLevel: "CORE",
    tags: ["trend", "pullback", "momentum"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 11,
      slippageBps: 7,
      maxPositionPct: 0.8,
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "sol_vol_burst",
    displayName: "SOL Volatility Burst",
    symbol: "SOLUSDT",
    timeframe: "15m",
    description: "Captures fast volatility expansions on SOL with tight exits.",
    riskLevel: "HIGH",
    tags: ["volatility", "momentum", "burst"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 15,
      slippageBps: 10,
      maxPositionPct: 0.75,
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "xrp_keltner_revert",
    displayName: "XRP Keltner Revert",
    symbol: "XRPUSDT",
    timeframe: "15m",
    description: "Reversion trades on XRP using Keltner channel extremes.",
    riskLevel: "CORE",
    tags: ["mean-reversion", "keltner", "range"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 10,
      slippageBps: 6,
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "doge_fast_momo",
    displayName: "DOGE Fast Momentum",
    symbol: "DOGEUSDT",
    timeframe: "15m",
    description: "High-tempo momentum bursts on DOGE with strict risk caps.",
    riskLevel: "HIGH",
    tags: ["momentum", "breakout", "high-beta"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 16,
      slippageBps: 12,
      maxPositionPct: 0.7,
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "ada_deep_revert",
    displayName: "ADA Deep Revert",
    symbol: "ADAUSDT",
    timeframe: "15m",
    description: "Deep pullback reversion on ADA targeting oversold snaps.",
    riskLevel: "CORE",
    tags: ["mean-reversion", "oversold", "pullback"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 11,
      slippageBps: 7,
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
  {
    slug: "trx_lowvol_band",
    displayName: "TRX Low-Vol Band",
    symbol: "TRXUSDT",
    timeframe: "15m",
    description: "Low-volatility band riding on TRX with conservative exits.",
    riskLevel: "LOW",
    tags: ["low-vol", "range", "defensive"],
    defaultConfig: {
      ...baseConfig,
      feesBps: 8,
      slippageBps: 5,
      maxPositionPct: 0.65,
      walkForward: {
        ...baseConfig.walkForward,
        minWinProb: 0.5,
      },
    },
    configSchema: baseConfigSchema,
    isEnabled: true,
  },
];

export const STRATEGY_CATALOG: StrategyCatalogEntry[] = [
  {
    name: "BTC Squeeze Breakout",
    description: "Volatility squeeze breakout on BTC with volume-confirmed entries.",
    riskTier: "HIGH",
    baseAsset: "USDT",
    pairsJson: ["BTC/USDT"],
    expectedMonthlyRangeBpsMin: 500,
    expectedMonthlyRangeBpsMax: 900,
    feesJson: { management: "0.6%", performance: "12%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-8.0%",
    maxDrawdown: "-18.0%",
    isActive: true,
  },
  {
    name: "ETH EMA Revert",
    description: "ETH mean reversion strategy around EMA stretch zones.",
    riskTier: "CORE",
    baseAsset: "USDT",
    pairsJson: ["ETH/USDT"],
    expectedMonthlyRangeBpsMin: 350,
    expectedMonthlyRangeBpsMax: 550,
    feesJson: { management: "0.5%", performance: "10%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-5.0%",
    maxDrawdown: "-12.0%",
    isActive: true,
  },
  {
    name: "BNB Trend Pullback",
    description: "Trend continuation on BNB via controlled pullback entries.",
    riskTier: "CORE",
    baseAsset: "USDT",
    pairsJson: ["BNB/USDT"],
    expectedMonthlyRangeBpsMin: 380,
    expectedMonthlyRangeBpsMax: 600,
    feesJson: { management: "0.5%", performance: "10%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-5.5%",
    maxDrawdown: "-13.0%",
    isActive: true,
  },
  {
    name: "SOL Volatility Burst",
    description: "Captures sudden volatility bursts on SOL with strict exits.",
    riskTier: "HIGH",
    baseAsset: "USDT",
    pairsJson: ["SOL/USDT"],
    expectedMonthlyRangeBpsMin: 550,
    expectedMonthlyRangeBpsMax: 950,
    feesJson: { management: "0.7%", performance: "14%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-9.0%",
    maxDrawdown: "-20.0%",
    isActive: true,
  },
  {
    name: "XRP Keltner Revert",
    description: "Reversion around Keltner bands for XRP range conditions.",
    riskTier: "CORE",
    baseAsset: "USDT",
    pairsJson: ["XRP/USDT"],
    expectedMonthlyRangeBpsMin: 300,
    expectedMonthlyRangeBpsMax: 500,
    feesJson: { management: "0.5%", performance: "10%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-4.5%",
    maxDrawdown: "-11.0%",
    isActive: true,
  },
  {
    name: "DOGE Fast Momentum",
    description: "Fast momentum strategy on DOGE with aggressive risk caps.",
    riskTier: "HIGH",
    baseAsset: "USDT",
    pairsJson: ["DOGE/USDT"],
    expectedMonthlyRangeBpsMin: 600,
    expectedMonthlyRangeBpsMax: 1000,
    feesJson: { management: "0.7%", performance: "15%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-10.0%",
    maxDrawdown: "-24.0%",
    isActive: true,
  },
  {
    name: "ADA Deep Revert",
    description: "Deep pullback reversion approach on ADA.",
    riskTier: "CORE",
    baseAsset: "USDT",
    pairsJson: ["ADA/USDT"],
    expectedMonthlyRangeBpsMin: 320,
    expectedMonthlyRangeBpsMax: 520,
    feesJson: { management: "0.5%", performance: "10%" },
    termsJson: { profitPayout: "MONTHLY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-5.0%",
    maxDrawdown: "-12.5%",
    isActive: true,
  },
  {
    name: "TRX Low-Vol Band",
    description: "Defensive TRX strategy riding low-volatility bands.",
    riskTier: "LOW",
    baseAsset: "USDT",
    pairsJson: ["TRX/USDT"],
    expectedMonthlyRangeBpsMin: 220,
    expectedMonthlyRangeBpsMax: 360,
    feesJson: { management: "0.4%", performance: "8%" },
    termsJson: { profitPayout: "DAILY", principalRedemption: "WEEKLY_WINDOW" },
    minInvestment: "100000000",
    worstMonth: "-2.0%",
    maxDrawdown: "-5.0%",
    isActive: true,
  },
];

export function getCanonicalStrategyProfiles(): StrategyProfileCatalogEntry[] {
  return STRATEGY_PROFILE_CATALOG;
}

export function getCanonicalStrategies(): StrategyCatalogEntry[] {
  return STRATEGY_CATALOG;
}

export function computeProfileSeedStats(existingSlugs: string[]): { inserted: number; updated: number } {
  const existing = new Set(existingSlugs);
  const canonical = getCanonicalStrategyProfiles();
  let inserted = 0;
  let updated = 0;

  for (const profile of canonical) {
    if (existing.has(profile.slug)) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  return { inserted, updated };
}
