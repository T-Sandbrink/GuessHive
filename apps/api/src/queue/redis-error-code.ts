/**
 * The machine-readable code of a Redis or job error (`ECONNREFUSED`, `NOAUTH`, …), or the
 * error's class name. Never the message: it can hold the Redis host, a password or job data.
 */
export function redisErrorCode(error: Error): string {
  return 'code' in error && typeof error.code === 'string' ? error.code : error.name;
}

/** How often a repeating connection error is logged while Redis stays down. */
export const ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Wraps a log call so it runs at most once per interval. ioredis retries every few seconds
 * while Redis is down; without this every retry would add a log line.
 */
export function throttled(
  log: (message: string) => void,
  intervalMs = ERROR_LOG_INTERVAL_MS,
  now: () => number = Date.now,
): (message: string) => void {
  let last = Number.NEGATIVE_INFINITY;
  return (message) => {
    const at = now();
    if (at - last >= intervalMs) {
      last = at;
      log(message);
    }
  };
}
