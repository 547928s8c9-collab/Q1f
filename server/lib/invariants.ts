export function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`INVARIANT_VIOLATION: ${label} cannot be negative (got ${value})`);
  }
}
