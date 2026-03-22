export function createIdempotencyKey(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(16).slice(2)}${Date.now()}`;
  const key = `${prefix}_${uuid}`;
  return key.slice(0, 64);
}
