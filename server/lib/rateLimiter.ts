/**
 * Simple in-memory rate limiter
 * For production, consider using Redis-based rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if a key has exceeded the rate limit
   * @param key - Unique identifier (e.g., userId)
   * @param maxAttempts - Maximum number of attempts allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if within limit, false if exceeded
   */
  check(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // Create new entry or reset expired entry
      this.store.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    if (entry.count >= maxAttempts) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Get remaining attempts for a key
   */
  getRemaining(key: string, maxAttempts: number): number {
    const entry = this.store.get(key);
    if (!entry) {
      return maxAttempts;
    }
    return Math.max(0, maxAttempts - entry.count);
  }

  /**
   * Get time until reset for a key
   */
  getResetTime(key: string): number | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    const remaining = entry.resetAt - Date.now();
    return remaining > 0 ? remaining : null;
  }

  /**
   * Reset rate limit for a key (e.g., on successful verification)
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

// Rate limit configuration for 2FA
export const TWO_FA_RATE_LIMIT = {
  maxAttempts: 5, // Maximum 5 attempts
  windowMs: 15 * 60 * 1000, // 15 minutes window
};
