import { describe, it, expect } from "vitest";
import { getAvailableProfiles } from "./factory";
import { STRATEGY_PROFILE_SLUGS } from "./types";

describe("strategy factory profiles", () => {
  it("returns the canonical 8 strategy profile slugs", () => {
    const profiles = getAvailableProfiles();
    expect(profiles).toHaveLength(STRATEGY_PROFILE_SLUGS.length);
    expect(new Set(profiles)).toEqual(new Set(STRATEGY_PROFILE_SLUGS));
  });
});
