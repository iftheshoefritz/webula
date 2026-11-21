// The parts of a long `scripts/collect_stats.mjs` run (#1431) that need no network: the days and
// the month windows of a backfill, and the wait that a rate-limited answer asks for.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Every UTC date from `since` to `until`, both `YYYY-MM-DD` and inclusive. */
export function days(since, until) {
  const out = [];
  for (let t = Date.parse(`${since}T00:00:00Z`); t <= Date.parse(`${until}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * The window split at month ends: `[[since, until], …]`. A search answers at most 1,000 results,
 * and a long backfill closes more items than that.
 */
export function monthWindows(since, until) {
  const windows = [];
  for (const day of days(since, until)) {
    const last = windows.at(-1);
    if (last && last[0].slice(0, 7) === day.slice(0, 7)) last[1] = day;
    else windows.push([day, day]);
  }
  return windows;
}

/**
 * The milliseconds to wait before a request may go again, from the status and the rate limit
 * headers of an answer, or 0 when the answer is not rate limited. A backfill of many days uses
 * more than the 5,000 requests an hour of a user token, so the collector waits for the reset
 * rather than stopping. `headers` has a `get(name)`, as a fetch `Headers` has.
 */
export function rateLimitWait(status, headers, now = Date.now()) {
  const limited = status === 429 || (status === 403 && headers.get('x-ratelimit-remaining') === '0');
  if (!limited) return 0;
  const retryAfter = Number(headers.get('retry-after'));
  if (retryAfter > 0) return retryAfter * 1000;
  const reset = Number(headers.get('x-ratelimit-reset'));
  return reset > 0 ? Math.max(reset * 1000 - now, 0) + 5000 : 60_000;
}
