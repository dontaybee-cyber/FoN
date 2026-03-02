/**
 * Semantic theme layer over the raw palette.
 * Use theme.success / theme.error etc. in feature code — never raw hex.
 *
 * STANDARD: All TTY output references theme tokens, not palette values directly.
 */
import { PALETTE } from "./palette.js";

function colorize(hex: string, text: string): string {
  // Convert hex to RGB and apply as ANSI truecolor escape.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}

export const theme = {
  /** Branded accent — primary interactive elements, prompts */
  accent:  (text: string) => colorize(PALETTE.accent, text),
  /** Success state — confirmations, OK statuses */
  success: (text: string) => colorize(PALETTE.success, text),
  /** Warning state — non-fatal issues, degraded conditions */
  warn:    (text: string) => colorize(PALETTE.warn, text),
  /** Error state — failures, blocked operations */
  error:   (text: string) => colorize(PALETTE.error, text),
  /** Muted / secondary — supplemental info, hints */
  muted:   (text: string) => colorize(PALETTE.muted, dim(text)),
  /** Informational — neutral highlights */
  info:    (text: string) => colorize(PALETTE.info, text),
  /** Bold — emphasis, headings in terminal output */
  bold,
  /** Dim — de-emphasize content */
  dim,
} as const;
