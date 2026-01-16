import type { Strategy, StrategyConfig, StrategyMeta, StrategyProfileSlug } from "./types";
import { createBtcSqueezeBreakout } from "./profiles/btcSqueezeBreakout";
import { createEthEmaRevert } from "./profiles/ethEmaRevert";
import { createBnbTrendPullback } from "./profiles/bnbTrendPullback";
import { createSolVolBurst } from "./profiles/solVolBurst";
import { createXrpKeltnerRevert } from "./profiles/xrpKeltnerRevert";
import { createDogeFastMomo } from "./profiles/dogeFastMomo";
import { createAdaDeepRevert } from "./profiles/adaDeepRevert";
import { createTrxLowVolBand } from "./profiles/trxLowVolBand";

const strategyFactories: Record<
  StrategyProfileSlug,
  (config: StrategyConfig, meta: StrategyMeta) => Strategy
> = {
  btc_squeeze_breakout: createBtcSqueezeBreakout,
  eth_ema_revert: createEthEmaRevert,
  bnb_trend_pullback: createBnbTrendPullback,
  sol_vol_burst: createSolVolBurst,
  xrp_keltner_revert: createXrpKeltnerRevert,
  doge_fast_momo: createDogeFastMomo,
  ada_deep_revert: createAdaDeepRevert,
  trx_lowvol_band: createTrxLowVolBand,
};

export function createStrategy(
  profileSlug: StrategyProfileSlug,
  config: StrategyConfig,
  meta: StrategyMeta
): Strategy {
  const factory = strategyFactories[profileSlug];
  if (!factory) {
    throw new Error(`Unknown strategy profile: ${profileSlug}`);
  }
  return factory(config, meta);
}

export function getAvailableProfiles(): StrategyProfileSlug[] {
  return Object.keys(strategyFactories) as StrategyProfileSlug[];
}
