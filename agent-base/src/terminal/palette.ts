/**
 * Shared color palette tokens for all CLI/terminal output.
 * STANDARD: Never hardcode ANSI codes or hex values in feature code.
 * Always import from here. "lobster seam" pattern from AGENT_STANDARDS.md.
 */
export const PALETTE = {
  accent:      "#5B8DEF",
  accentBright:"#7BA7FF",
  accentDim:   "#3A6BC4",
  info:        "#64B5F6",
  success:     "#2FBF71",
  warn:        "#FFB020",
  error:       "#E23D2D",
  muted:       "#8B8B9A",
} as const;

export type PaletteKey = keyof typeof PALETTE;
