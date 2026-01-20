export class ResponseCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries: number = 500
  ) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }
  }
}
