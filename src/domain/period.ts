/**
 * Local calendar-month period math (SPEC-implementation.md §27.3 / P-11). Deliberately narrow
 * for now — just what F6.5's Home tiles need (this month + the previous one, for the MoM
 * comparison, D2). F9's Analytics screen extends this with week mode, stepping and labels; the
 * `{ startMs, endMsExclusive }` shape here is meant to grow into that, not be replaced by it.
 */

import { addMonths, startOfMonth } from 'date-fns';

export type Period = { startMs: number; endMsExclusive: number };

/** The calendar month containing `anchorTs` (defaults to now), in the device's local zone. */
export function monthPeriod(anchorTs: number = Date.now()): Period {
  const start = startOfMonth(anchorTs);
  return { startMs: start.getTime(), endMsExclusive: startOfMonth(addMonths(start, 1)).getTime() };
}

/** The calendar month immediately before `period`, with no gap or overlap. */
export function previousMonthPeriod(period: Period): Period {
  const prevStart = startOfMonth(addMonths(period.startMs, -1));
  return { startMs: prevStart.getTime(), endMsExclusive: period.startMs };
}
