/**
 * CLI progress and spinner utilities.
 * STANDARD: Never hand-roll spinners or progress bars. Import from here.
 *
 * Uses only Node built-ins — no external dependency required.
 */

import { theme } from "../terminal/theme.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

export type Spinner = {
  /** Update the message shown next to the spinner */
  update: (msg: string) => void;
  /** Stop and display a success message */
  succeed: (msg: string) => void;
  /** Stop and display an error message */
  fail: (msg: string) => void;
  /** Stop and display a warning message */
  warn: (msg: string) => void;
  /** Stop the spinner without a final message */
  stop: () => void;
};

/**
 * Creates and starts an animated terminal spinner.
 * Cleans up automatically when stopped.
 *
 * @example
 * const spin = createSpinner("Connecting to agent...");
 * await doWork();
 * spin.succeed("Connected");
 */
export function createSpinner(initialMsg: string): Spinner {
  let frameIdx = 0;
  let currentMsg = initialMsg;
  let stopped = false;

  // Only animate when stdout is a TTY.
  const isTTY = Boolean(process.stdout.isTTY);

  function clearLine(): void {
    if (!isTTY) return;
    process.stdout.write("\r\x1b[K");
  }

  function render(): void {
    if (stopped || !isTTY) return;
    const frame = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length] ?? "⠋";
    process.stdout.write(`\r${theme.accent(frame)} ${currentMsg}`);
    frameIdx++;
  }

  if (isTTY) {
    process.stdout.write(`${theme.accent(SPINNER_FRAMES[0] ?? "⠋")} ${currentMsg}`);
  } else {
    process.stdout.write(`${currentMsg}\n`);
  }

  const interval = isTTY
    ? setInterval(render, SPINNER_INTERVAL_MS)
    : null;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (interval) clearInterval(interval);
    clearLine();
  }

  return {
    update(msg) {
      currentMsg = msg;
    },
    succeed(msg) {
      stop();
      process.stdout.write(`${theme.success("✔")} ${msg}\n`);
    },
    fail(msg) {
      stop();
      process.stderr.write(`${theme.error("✖")} ${msg}\n`);
    },
    warn(msg) {
      stop();
      process.stdout.write(`${theme.warn("⚠")} ${msg}\n`);
    },
    stop,
  };
}

/**
 * Wraps an async operation with a spinner that auto-resolves on completion.
 *
 * @example
 * const result = await withSpinner("Loading config...", async () => {
 *   return loadConfig();
 * }, { success: "Config loaded", failure: "Failed to load config" });
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
  labels?: { success?: string; failure?: string },
): Promise<T> {
  const spin = createSpinner(message);
  try {
    const result = await fn();
    spin.succeed(labels?.success ?? message);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    spin.fail(labels?.failure ? `${labels.failure}: ${errMsg}` : errMsg);
    throw err;
  }
}
