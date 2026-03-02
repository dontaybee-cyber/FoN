/**
 * Tests for src/infra/rate-limit.ts and src/infra/format-time.ts
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter } from "./rate-limit.js";
import { formatDuration, formatAge, formatTimestamp, formatElapsed } from "./format-time.js";

// ── Rate Limiter ──────────────────────────────────────────────────────────────

describe("createRateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 10_000 });
    expect(limiter.consume()).toBe(true);
    expect(limiter.consume()).toBe(true);
    expect(limiter.consume()).toBe(true);
  });

  it("blocks requests beyond the limit", () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 10_000 });
    limiter.consume();
    limiter.consume();
    expect(limiter.consume()).toBe(false);
  });

  it("tracks remaining slots correctly", () => {
    const limiter = createRateLimiter({ maxRequests: 5, windowMs: 10_000 });
    expect(limiter.remaining()).toBe(5);
    limiter.consume();
    limiter.consume();
    expect(limiter.remaining()).toBe(3);
  });

  it("check() does not consume a slot", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 10_000 });
    expect(limiter.check()).toBe(true);
    expect(limiter.check()).toBe(true);   // still 1 remaining
    expect(limiter.remaining()).toBe(1);  // not consumed
  });

  it("resets state when reset() is called", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter.consume();
    expect(limiter.consume()).toBe(false);
    limiter.reset();
    expect(limiter.consume()).toBe(true);
  });

  it("returns a positive resetIn value when limited", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 5_000 });
    limiter.consume();
    expect(limiter.resetIn()).toBeGreaterThan(0);
    expect(limiter.resetIn()).toBeLessThanOrEqual(5_000);
  });
});

// ── Format Time ───────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("shows < 1s for sub-second durations", () => {
    expect(formatDuration(0)).toBe("< 1s");
    expect(formatDuration(999)).toBe("< 1s");
  });

  it("shows seconds only for < 1 minute", () => {
    expect(formatDuration(1_000)).toBe("1s");
    expect(formatDuration(45_000)).toBe("45s");
  });

  it("shows minutes and seconds for < 1 hour", () => {
    expect(formatDuration(61_000)).toBe("1m 1s");
    expect(formatDuration(90_000)).toBe("1m 30s");
  });

  it("shows hours, minutes, and seconds", () => {
    expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
  });
});

describe("formatAge", () => {
  it("returns a human-readable age", () => {
    const oneMinuteAgo = Date.now() - 62_000;
    expect(formatAge(oneMinuteAgo)).toMatch(/1m/);
  });

  it("returns 'just now' for future timestamps", () => {
    expect(formatAge(Date.now() + 1_000)).toBe("just now");
  });
});

describe("formatTimestamp", () => {
  it("formats a Date object to a readable string", () => {
    const d = new Date("2026-02-23T14:05:02.000Z");
    const result = formatTimestamp(d);
    // Output format: YYYY-MM-DD HH:MM:SS (local time — just check shape)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("accepts a numeric timestamp", () => {
    const result = formatTimestamp(1_700_000_000_000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("formatElapsed", () => {
  it("returns elapsed time from a start timestamp", () => {
    const start  = Date.now() - 5_500;
    const result = formatElapsed(start);
    expect(result).toBe("5s");
  });
});
