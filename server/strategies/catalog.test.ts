import { describe, it, expect } from "vitest";
import { computeProfileSeedStats, getCanonicalStrategyProfiles } from "./catalog";

describe("strategy profile catalog", () => {
  it("exposes eight canonical profiles", () => {
    const profiles = getCanonicalStrategyProfiles();
    expect(profiles).toHaveLength(8);
  });

  it("computes seed stats for existing profiles", () => {
    const existing = ["btc_squeeze_breakout", "eth_ema_revert", "bnb_trend_pullback"];
    const { inserted, updated } = computeProfileSeedStats(existing);
    expect(updated).toBe(3);
    expect(inserted).toBe(5);
  });
});
