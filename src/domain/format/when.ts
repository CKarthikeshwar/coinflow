/**
 * Relative/absolute time formatter — SPEC-implementation.md §27.2 (the `formatWhen` half; the
 * day-header helper lands when the Transactions list needs it). Pure TS aside from `date-fns`.
 */

import { format, isSameYear } from 'date-fns';

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
