/**
 * Monotonic clock utility.
 * Ensures timestamps never go backwards even if system clock is adjusted.
 */
let lastTimestamp = 0;

/**
 * Returns current time in Unix milliseconds.
 * Guarantees monotonically increasing values.
 */
export function nowMs(): number {
  const now = Date.now();
  lastTimestamp = Math.max(now, lastTimestamp + 1);
  return lastTimestamp;
}

/**
 * Reset the monotonic clock (for testing only).
 */
export function resetClock(): void {
  lastTimestamp = 0;
}
