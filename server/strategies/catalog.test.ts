import { describe, it, expect } from "vitest";
import { computeProfileSeedStats, getCanonicalStrategyProfiles } from "./catalog";
import { STRATEGY_PROFILE_SLUGS } from "./types";

describe("strategy profile catalog", () => {
  it("exposes all canonical profiles", () => {
    const profiles = getCanonicalStrategyProfiles();
    expect(profiles).toHaveLength(STRATEGY_PROFILE_SLUGS.length);
  });

  it("computes seed stats for existing profiles", () => {
    const existing = ["btc_squeeze_breakout", "eth_ema_revert", "bnb_trend_pullback"];
    const { inserted, updated } = computeProfileSeedStats(existing);
    expect(updated).toBe(3);
    expect(inserted).toBe(STRATEGY_PROFILE_SLUGS.length - 3);
  });
});
