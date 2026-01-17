import { describe, it, expect } from "vitest";
import { normalizePath } from "../metrics/normalizePath";

describe("normalizePath", () => {
  it("replaces numeric IDs with :id", () => {
    expect(normalizePath("/api/users/123/profile")).toBe("/api/users/:id/profile");
    expect(normalizePath("/api/orders/99999")).toBe("/api/orders/:id");
  });

  it("replaces UUIDs with :id", () => {
    expect(normalizePath("/api/withdrawals/550e8400-e29b-41d4-a716-446655440000")).toBe("/api/withdrawals/:id");
    expect(normalizePath("/api/users/123e4567-e89b-12d3-a456-426614174000/settings")).toBe("/api/users/:id/settings");
  });

  it("replaces long hex strings (>=24 chars) with :id", () => {
    expect(normalizePath("/api/tx/abcdef1234567890abcdef12")).toBe("/api/tx/:id");
    expect(normalizePath("/api/hash/abcdef1234567890abcdef1234567890abcdef12")).toBe("/api/hash/:id");
  });

  it("preserves non-ID segments", () => {
    expect(normalizePath("/api/users")).toBe("/api/users");
    expect(normalizePath("/api/strategies/list")).toBe("/api/strategies/list");
    expect(normalizePath("/api/market/candles")).toBe("/api/market/candles");
  });

  it("handles mixed paths correctly", () => {
    expect(normalizePath("/api/users/123/orders/456")).toBe("/api/users/:id/orders/:id");
  });
});
