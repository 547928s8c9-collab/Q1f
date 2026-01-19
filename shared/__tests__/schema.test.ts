import { describe, it, expect } from "vitest";
import { AddressStatus, normalizeAddressStatus } from "../schema";

describe("normalizeAddressStatus", () => {
  it("normalizes supported statuses and rejects unknown values", () => {
    expect(normalizeAddressStatus("active")).toBe(AddressStatus.ACTIVE);
    expect(normalizeAddressStatus("PENDING_ACTIVATION")).toBe(AddressStatus.PENDING_ACTIVATION);
    expect(normalizeAddressStatus("disabled")).toBe(AddressStatus.DISABLED);
    expect(normalizeAddressStatus("unknown")).toBeNull();
  });
});
