import { describe } from "vitest";

export function describeWithDb(name: string, fn: () => void) {
  if (process.env.DATABASE_URL) {
    return describe(name, fn);
  }
  return describe.skip(`${name} (requires DATABASE_URL)`, fn);
}
