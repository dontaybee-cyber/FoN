/**
 * Fixed-window rate limiter.
 * Protects against burst abuse (DoS via resource exhaustion, CWE-400).
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 100, windowMs: 10_000 });
 *   if (!limiter.check()) throw new RateLimitError();
 *   limiter.consume();
 */

export type RateLimiterOptions = {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
};

export type RateLimiter = {
  /** Returns true if a request is allowed without consuming a slot */
  check: () => boolean;
  /** Attempts to consume a slot. Returns true if successful, false if rate limited */
  consume: () => boolean;
  /** Remaining slots in the current window */
  remaining: () => number;
  /** Milliseconds until the current window resets */
  resetIn: () => number;
  /** Reset the limiter state (useful in tests) */
  reset: () => void;
};

/**
 * Creates a fixed-window rate limiter.
 *
 * @example
 * const limiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });
 *
 * if (!limiter.consume()) {
 *   throw new Error(`Rate limited. Resets in ${limiter.resetIn()}ms`);
 * }
 */
export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { maxRequests, windowMs } = opts;

  let windowStart = Date.now();
  let count = 0;

  function refresh(): void {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
  }

  return {
    check() {
      refresh();
      return count < maxRequests;
    },
    consume() {
      refresh();
      if (count >= maxRequests) return false;
      count++;
      return true;
    },
    remaining() {
      refresh();
      return Math.max(0, maxRequests - count);
    },
    resetIn() {
      return Math.max(0, windowMs - (Date.now() - windowStart));
    },
    reset() {
      windowStart = Date.now();
      count = 0;
    },
  };
}
