/**
 * FILE PURPOSE
 * ------------
 * Pure math for the Analytics tab: percent-change, day-by-day spend buckets, mean/median,
 * the chart's y-axis scaling, and category color lookup. "Pure" means no database, no
 * react-native/expo imports, no side effects — every function here just takes plain data in
 * and returns plain data out, which is what makes it cheap to unit test.
 *
 * WHERE IT FITS
 * -------------
 * This is the bottom layer of the Analytics feature. The actual SQL queries (which rows to
 * pull from the database) live one layer up, in `src/db/repositories/analytics.ts` — that
 * file fetches the raw rows, then calls into the functions here to turn them into the
 * shapes the Analytics screen renders (a day-by-day series, a mean, a median, etc).
 *
 * USED BY
 * -------
 * - `src/db/repositories/analytics.ts` (`percentDelta`, `buildDailySeries`, `meanDailySpend`,
 *   `medianDailySpend`, `dailyChartYMax`) — builds the period summary the Analytics screen reads.
 * - `src/features/analytics/category-breakdown.tsx` (`shareOf`, `resolveCategoryColor`) —
 *   turns per-category totals into percentages and picks each category's chart color.
 *
 * DEPENDS ON
 * ----------
 * `src/domain/period.ts` for "what day does this timestamp fall on" helpers (`startOfLocalDay`,
 * `endOfLocalDayExclusive`) — everything here works in local-device days, not UTC days.
 *
 * IMPORTANT
 * ---------
 * `resolveCategoryColor` takes the color palette as a plain parameter instead of importing it
 * from `constants/theme.ts` directly — importing `theme.ts` would pull in `react-native`, which
 * would break the "no framework imports" rule this file follows. If you need another palette
 * lookup here, keep passing it in rather than importing `Colors`/`CategoryPalette` directly.
 */

import { addDays } from 'date-fns';

import { endOfLocalDayExclusive, startOfLocalDay, type Period } from './period';

/**
 * Percent change vs. a comparison figure (§26.3), `null` when there's nothing meaningful to
 * compare against (`previous === 0` — e.g. no prior-month data). Rendered by
 * `formatPercentDelta` (§27.1).
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export type DailyPoint = { dayStartMs: number; amountMinor: number };

/**
 * §26.6 — zero-filled daily expense series from `period.startMs` to `min(period.endMsExclusive,
 * today)`. `rows` should already be `type='expense'` in the period (the repo's job); this just
 * buckets by local day and fills the gaps, it doesn't filter by type/period itself beyond
 * clamping to the day range (a stray out-of-range row is silently ignored rather than trusted).
 */
export function buildDailySeries(
  rows: { occurredAt: number; amountMinor: number }[],
  period: Period,
  now: number = Date.now(),
): DailyPoint[] {
  const endMs = Math.min(period.endMsExclusive, endOfLocalDayExclusive(now));
  const byDay = new Map<number, number>();
  for (const row of rows) {
    const day = startOfLocalDay(row.occurredAt);
    if (day < period.startMs || day >= endMs) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + row.amountMinor);
  }

  const series: DailyPoint[] = [];
  for (let day = period.startMs; day < endMs; day = addDays(day, 1).getTime()) {
    series.push({ dayStartMs: day, amountMinor: byDay.get(day) ?? 0 });
  }
  return series;
}

/** §26.6 — `spentMinor / daysElapsed`; `daysElapsed` is just the series length (already clamped
 * to today for an incomplete period, IMP-035). `0` for an empty series, not `NaN`. */
export function meanDailySpend(series: DailyPoint[]): number {
  if (series.length === 0) return 0;
  const total = series.reduce((sum, d) => sum + d.amountMinor, 0);
  return total / series.length;
}

/** §26.6 — median of the zero-filled series (mean of the two middles on an even count). Resists
 * a single rent-day spike the way a mean can't. */
export function medianDailySpend(series: DailyPoint[]): number {
  if (series.length === 0) return 0;
  const sorted = series.map((d) => d.amountMinor).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * §26.6 outlier scaling — the chart's y-axis max. `max(p95 of non-zero daily values, 1)`, so one
 * rent-day spike doesn't flatten every other bar; that day is clipped and inline-labelled by the
 * chart component instead. `1` (not `0`) when there are no non-zero days, so the axis is never
 * degenerate.
 */
export function dailyChartYMax(series: DailyPoint[]): number {
  const nonZero = series.map((d) => d.amountMinor).filter((v) => v > 0);
  if (nonZero.length === 0) return 1;
  nonZero.sort((a, b) => a - b);
  const rank = Math.min(nonZero.length, Math.max(1, Math.ceil(0.95 * nonZero.length)));
  return Math.max(nonZero[rank - 1], 1);
}

/** `amountMinor / totalMinor`, `0` (not `NaN`) when `totalMinor` is `0` — an empty period. */
export function shareOf(amountMinor: number, totalMinor: number): number {
  return totalMinor > 0 ? amountMinor / totalMinor : 0;
}

/**
 * §3.1/D33 — `CategoryPalette`'s 9 hues are keyed by the 9 default categories' own `key`; a
 * custom category (`key: null`) has no spec'd colour at all. V1 simplification (flagged in
 * `SPEC/traceability.md`, not silent): cycle a custom category through the same 9 hues by its
 * `order` field — deterministic, an occasional hue collision with another category accepted.
 */
export function resolveCategoryColor(
  category: { key: string | null; order: number },
  palette: Record<string, string>,
): string {
  if (category.key && category.key in palette) return palette[category.key];
  const hues = Object.values(palette);
  return hues[category.order % hues.length];
}
