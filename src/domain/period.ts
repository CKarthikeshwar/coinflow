/**
 * FILE PURPOSE
 * ------------
 * All "what calendar period am I looking at, and what day does this timestamp fall in" logic
 * lives here: the current month or week as a `{ start, end, label }` triple, stepping to the
 * next/previous period, and converting a raw timestamp into "which local day is this."
 *
 * WHERE IT FITS
 * -------------
 * Both Home (month totals) and Analytics (month or week, steppable) are built around a `Period`
 * object from this file. Anywhere the app needs to ask a database query "give me the rows
 * between these two timestamps," that range comes from here — this file doesn't touch the
 * database itself, it just does date math.
 *
 * USED BY
 * -------
 * - `src/stores/analytics-period.ts` — holds the *currently selected* period (month/week +
 *   which one) in app state, built with the functions here.
 * - `src/features/analytics/period-control.tsx` — the "‹ September 2026 ›" stepper UI calls
 *   `stepPeriod`/`previousPeriod` when you tap the arrows.
 * - `src/db/repositories/analytics.ts` and `src/db/repositories/transactions.ts` — use
 *   `startMs`/`endMsExclusive` from a `Period` as the date-range bounds in their SQL queries,
 *   and use `startOfLocalDay`/`dayIndex` to bucket rows by day.
 * - `src/domain/analytics.ts` — uses the local-day helpers to build the daily spend chart.
 *
 * IMPORTANT
 * ---------
 * All of this works in the *device's local timezone*, not UTC — "today" means today where the
 * phone is set, so a transaction just after local midnight counts toward the new day even
 * though the UTC day hasn't changed yet. `dayIndex` assumes no DST (fine for India, the only
 * region this app currently targets); it would need adjusting before targeting a DST timezone.
 * Previously, both `transactions.tsx` (screen) and `transactions.ts` (repository) each had
 * their own private copy of the "which local day does this timestamp fall in" logic — they were
 * consolidated into the single `startOfLocalDay`/`dayIndex` helpers here so day-bucketing
 * behaves identically everywhere it's used.
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
