/**
 * Local calendar period math (SPEC-implementation.md §27.3 / P-11). Built narrow for F6.5's
 * Home tiles (month-only); F9's Analytics screen is the "grow into it" this file's original
 * header predicted — week mode, stepping, labels, and the day-bucketing helpers that used to be
 * a private `localDayStart` copy in both `transactions.tsx` and `transactions.ts`'s repo (each
 * had an identical inline function with a comment pointing at this exact consolidation).
 */

import { addDays, addMonths, addWeeks, format, isSameYear, startOfDay, startOfISOWeek, startOfMonth } from 'date-fns';

export type Period = { mode: 'month' | 'week'; startMs: number; endMsExclusive: number; label: string };

const MS_PER_DAY = 86_400_000;

/** Device-zone midnight for the local day containing `ts`. */
export function startOfLocalDay(ts: number): number {
  return startOfDay(ts).getTime();
}

/** The exclusive end of the local day containing `ts` — i.e. next local midnight. */
export function endOfLocalDayExclusive(ts: number): number {
  return startOfDay(addDays(ts, 1)).getTime();
}

/**
 * Integer local-day count from the epoch — the day-bucketing key (§27.3). India has no DST, so
 * a plain floor-division of the local-midnight epoch-ms is exact; not attempting DST correctness
 * for other zones.
 */
export function dayIndex(ts: number): number {
  return Math.floor(startOfLocalDay(ts) / MS_PER_DAY);
}

function monthLabel(startMs: number): string {
  return isSameYear(startMs, Date.now()) ? format(startMs, 'MMMM') : format(startMs, 'MMM yyyy');
}

function weekLabel(startMs: number, endMsExclusive: number): string {
  const lastDayMs = addDays(endMsExclusive, -1).getTime();
  return `${format(startMs, 'd MMM')} – ${format(lastDayMs, 'd MMM')}`;
}

/** The calendar month containing `anchorTs` (defaults to now), in the device's local zone. */
export function monthPeriod(anchorTs: number = Date.now()): Period {
  const start = startOfMonth(anchorTs);
  const endMsExclusive = startOfMonth(addMonths(start, 1)).getTime();
  const startMs = start.getTime();
  return { mode: 'month', startMs, endMsExclusive, label: monthLabel(startMs) };
}

/** The ISO week (Mon–Sun) containing `anchorTs` (defaults to now), in the device's local zone. */
export function isoWeekPeriod(anchorTs: number = Date.now()): Period {
  const start = startOfISOWeek(anchorTs);
  const startMs = start.getTime();
  const endMsExclusive = addDays(start, 7).getTime();
  return { mode: 'week', startMs, endMsExclusive, label: weekLabel(startMs, endMsExclusive) };
}

/** One calendar month, or one ISO week, immediately before `period` — same mode, no gap (CR-1). */
export function previousPeriod(period: Period): Period {
  return period.mode === 'week'
    ? isoWeekPeriod(addWeeks(period.startMs, -1).getTime())
    : monthPeriod(addMonths(period.startMs, -1).getTime());
}

/**
 * Steps one period forward/back, same mode. `dir: 1` is a no-op when the *next* period would
 * start in the future — "next" is disabled on the current period (§6.10), not silently stepped
 * into one that has no data yet.
 */
export function stepPeriod(period: Period, dir: -1 | 1): Period {
  const anchorMs =
    period.mode === 'week' ? addWeeks(period.startMs, dir).getTime() : addMonths(period.startMs, dir).getTime();
  const next = period.mode === 'week' ? isoWeekPeriod(anchorMs) : monthPeriod(anchorMs);
  if (dir === 1 && next.startMs > Date.now()) return period;
  return next;
}
