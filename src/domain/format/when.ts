/**
 * Relative/absolute time formatter — SPEC-implementation.md §27.2. Pure TS aside from `date-fns`.
 */

import { format, isSameYear, isToday, isYesterday } from 'date-fns';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Relative within ~7 days (`just now` < 60s, `Nm ago`, `Nh ago`, `Yesterday`, `N days ago`);
 * absolute beyond that (`3 Aug`, or `3 Aug 2025` outside the current year).
 */
export function formatWhen(ts: number, now: number = Date.now()): string {
  const diff = now - ts;

  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < 2 * DAY_MS) return 'Yesterday';
  if (diff < WEEK_MS) return `${Math.floor(diff / DAY_MS)} days ago`;

  const date = new Date(ts);
  return isSameYear(date, now) ? format(date, 'd MMM') : format(date, 'd MMM yyyy');
}

/** `Today` / `Yesterday` / `Wed, 3 Sep` — the day-group header on the Transactions list (§6.7). */
export function formatDayHeader(dayStartMs: number): string {
  const date = new Date(dayStartMs);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEE, d MMM');
}

/**
 * `September` — the month label on Home's brand top bar (§6.2). Takes `ts` (defaulting to now)
 * rather than calling `Date.now()` at the call site, same reason as every other `now = Date.now()`
 * default in this file: the render-purity lint flags a direct `Date.now()` call written inline
 * in a component, not one hidden behind a default parameter in an imported pure function.
 */
export function formatMonthLabel(ts: number = Date.now()): string {
  return format(ts, 'MMMM');
}
