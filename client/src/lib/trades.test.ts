import { describe, expect, it } from "vitest";
import { computeSlippageFromEvents } from "@/lib/trades";

describe("computeSlippageFromEvents", () => {
  it("returns null when no qualifying events exist", () => {
    const events = [
      { type: "TRADE_INTENT", payloadJson: { intendedPrice: 100 } },
      { type: "FILLED", payloadJson: { price: 101 } },
    ];

    expect(computeSlippageFromEvents(events, 1)).toBeNull();
  });

  it("uses intendedPrice vs price with qty from payload", () => {
    const events = [
      { type: "FILLED", payloadJson: { intendedPrice: 100, price: 101, qty: 2 } },
      { type: "CLOSED", payloadJson: { intendedPrice: 105, price: 104, qty: 2 } },
    ];

    expect(computeSlippageFromEvents(events)).toBeCloseTo(4);
  });

  it("falls back to trade qty when payload qty is missing", () => {
    const events = [
      { type: "FILLED", payloadJson: { intendedPrice: "100", price: "102" } },
    ];

    expect(computeSlippageFromEvents(events, 1.5)).toBeCloseTo(3);
  });
});
