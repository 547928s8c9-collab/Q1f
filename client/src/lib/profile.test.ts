import { describe, expect, it } from "vitest";
import { getProfileDisplayName, getProfileInitials } from "./profile";

describe("getProfileDisplayName", () => {
  it("returns full name when available", () => {
    expect(getProfileDisplayName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
  });

  it("falls back to email when names are missing", () => {
    expect(getProfileDisplayName({ email: "ada@example.com" })).toBe("ada@example.com");
  });

  it("falls back to a default label when data is missing", () => {
    expect(getProfileDisplayName(null)).toBe("User");
  });
});

describe("getProfileInitials", () => {
  it("builds initials from name", () => {
    expect(getProfileInitials({ firstName: "Ada", lastName: "Lovelace" })).toBe("AL");
  });

  it("uses email when names are missing", () => {
    expect(getProfileInitials({ email: "ada@example.com" })).toBe("A");
  });

  it("falls back to U when no data is present", () => {
    expect(getProfileInitials(undefined)).toBe("U");
  });
});
