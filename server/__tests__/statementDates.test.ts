import { describe, it, expect } from "vitest";
import { getStatementDateRange, isValidStatementMonth } from "../lib/statementDates";

describe("getStatementDateRange", () => {
  it("returns correct date range for January 2026", () => {
    const { startDate, endDate, year, month } = getStatementDateRange(2026, 1);
    expect(year).toBe(2026);
    expect(month).toBe(1);
    expect(startDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("handles February correctly (non-leap year)", () => {
    const { startDate, endDate } = getStatementDateRange(2025, 2);
    expect(startDate.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2025-02-28T23:59:59.999Z");
  });

  it("handles February correctly (leap year)", () => {
    const { startDate, endDate } = getStatementDateRange(2024, 2);
    expect(startDate.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });

  it("handles December correctly", () => {
    const { startDate, endDate } = getStatementDateRange(2025, 12);
    expect(startDate.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });
});

describe("isValidStatementMonth", () => {
  it("rejects invalid month numbers", () => {
    expect(isValidStatementMonth(2025, 0)).toBe(false);
    expect(isValidStatementMonth(2025, 13)).toBe(false);
    expect(isValidStatementMonth(2025, -1)).toBe(false);
  });

  it("rejects years before 2020", () => {
    expect(isValidStatementMonth(2019, 12)).toBe(false);
    expect(isValidStatementMonth(2015, 6)).toBe(false);
  });

  it("accepts valid past months", () => {
    expect(isValidStatementMonth(2024, 6)).toBe(true);
    expect(isValidStatementMonth(2020, 1)).toBe(true);
  });
});
