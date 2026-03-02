/**
 * Centralized time and duration formatting.
 * STANDARD: NEVER create local formatAge / formatDuration / formatElapsedTime.
 * Always import from this module.
 */

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * @example
 * formatDuration(3_661_000) // "1h 1m 1s"
 * formatDuration(4_500)     // "4s"
 * formatDuration(500)       // "< 1s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1_000) return "< 1s";

  const seconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);

  const s = seconds % 60;
  const m = minutes % 60;
  const h = hours;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Format a past timestamp as a human-readable age relative to now.
 *
 * @example
 * formatAge(Date.now() - 70_000)    // "1m ago"
 * formatAge(Date.now() - 3_700_000) // "1h ago"
 */
export function formatAge(timestampMs: number): string {
  const delta = Date.now() - timestampMs;
  if (delta < 0) return "just now";
  return `${formatDuration(delta)} ago`;
}

/**
 * Format a Date (or timestamp) as a short ISO-like local datetime.
 *
 * @example
 * formatTimestamp(new Date()) // "2026-02-23 14:05:02"
 */
export function formatTimestamp(date: Date | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * Format elapsed time since a start timestamp (for live timers / progress).
 */
export function formatElapsed(startMs: number): string {
  return formatDuration(Date.now() - startMs);
}
