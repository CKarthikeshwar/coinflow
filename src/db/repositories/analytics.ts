/**
 * FILE PURPOSE
 * ------------
 * All the aggregate/summary numbers shown on the Home screen and the Analytics tab: running
 * balance, this-period spend/income, month-over-month percent change, spend broken down by
 * category, the biggest expenses, and a day-by-day spend chart with mean/median. Every function
 * here is read-only — it computes a live-updating summary from the `transactions` table, it
 * never writes to it.
 *
 * WHERE IT FITS
 * -------------
 * This is the SQL half of the Analytics feature; `src/domain/analytics.ts` is the pure-math
 * half. The split exists because SQL aggregation (SUM, COUNT, GROUP BY) is efficient to do
 * inside SQLite, but bucketing a result into "one entry per calendar day, including days with
 * zero spend" and computing percentiles/medians is easier and more testable in plain JS — so
 * this file fetches rows with SQL, then hands them to `domain/analytics.ts`'s pure functions to
 * finish the calculation.
 *
 * USED BY
 * -------
 * `src/app/(tabs)/index.tsx` (Home: `useRunningBalance`, `usePeriodSummary`, `useMoMDeltas`,
 * `useUncategorizedCount`) and `src/app/(tabs)/analytics.tsx` (Analytics tab: all of the above
 * plus `useCategoryBreakdown`, `useLargestExpenses`, `useDailySeries`).
 *
 * IMPORTANT
 * ---------
 * Every hook here uses `useLiveQuery` (`src/hooks/use-live-query.ts`), so these numbers update
 * automatically the instant a transaction is added/edited/deleted anywhere in the app —
 * including from the background SMS task — without the screen needing to manually refetch.
 * The running balance is always computed live from every transaction ever recorded; it is
 * NEVER read from a bank SMS's own "Available balance" text, since that figure isn't
 * trustworthy as a running total (it can include transactions this app never saw).
 */

import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  buildDailySeries,
  dailyChartYMax,
  meanDailySpend,
  medianDailySpend,
  percentDelta,
} from '@/domain/analytics';
import { monthPeriod, previousPeriod, type Period } from '@/domain/period';
import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { transactions } from '../schema';

/** §26.2 — the all-time computed net (D2). Never an SMS "Avl Bal" read. May be negative. */
export function useRunningBalance() {
  const q = useLiveQuery(
    db
      .select({
        balanceMinor: sql<number>`COALESCE(SUM(CASE ${transactions.type} WHEN 'income' THEN ${transactions.amountMinor} WHEN 'expense' THEN -${transactions.amountMinor} END), 0)`,
      })
      .from(transactions)
      .where(isNull(transactions.deletedAt)),
  );
  return { balanceMinor: q.data[0]?.balanceMinor ?? 0, error: q.error, updatedAt: q.updatedAt };
}

/** §26.1 — Spent / Income for one period. Defaults to the current calendar month. */
export function usePeriodSummary(period: Period = monthPeriod()) {
  const q = useLiveQuery(
    db
      .select({
        spentMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amountMinor} END), 0)`,
        incomeMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amountMinor} END), 0)`,
      })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          sql`${transactions.occurredAt} >= ${period.startMs}`,
          sql`${transactions.occurredAt} < ${period.endMsExclusive}`,
        ),
      ),
    [period.startMs, period.endMsExclusive],
  );
  const row = q.data[0];
  return {
    spentMinor: row?.spentMinor ?? 0,
    incomeMinor: row?.incomeMinor ?? 0,
    error: q.error,
    updatedAt: q.updatedAt,
  };
}

/** §26.3 — this period vs. the previous one; each `null` when there's no prior-period figure. */
export function useMoMDeltas(period: Period = monthPeriod()) {
  const current = usePeriodSummary(period);
  const previous = usePeriodSummary(previousPeriod(period));
  return {
    spendingDeltaPct: percentDelta(current.spentMinor, previous.spentMinor),
    incomeDeltaPct: percentDelta(current.incomeMinor, previous.incomeMinor),
    error: current.error ?? previous.error,
    updatedAt: current.updatedAt && previous.updatedAt ? current.updatedAt : undefined,
  };
}

/**
 * §26.8 — `count(*) WHERE type='expense' AND categoryId IS NULL`, optionally period-scoped.
 * No `period` (Home's action-strip row) = all-time. With `period` (Analytics "Fix N") = scoped
 * to it — a separate call, not a shared cache, since the two rows can legitimately disagree
 * (e.g. an old uncategorized expense outside the current period).
 */
export function useUncategorizedCount(period?: Period) {
  const q = useLiveQuery(
    db
      .select({ n: count() })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'expense'),
          isNull(transactions.categoryId),
          ...(period
            ? [sql`${transactions.occurredAt} >= ${period.startMs}`, sql`${transactions.occurredAt} < ${period.endMsExclusive}`]
            : []),
        ),
      ),
    period ? [period.startMs, period.endMsExclusive] : [],
  );
  return { count: q.data[0]?.n ?? 0, error: q.error, updatedAt: q.updatedAt };
}

/** §26.4 — "Where it went". `categoryId: null` is the Uncategorized bucket (own row, hatched,
 * IMP-033), ordered by spend descending. */
export function useCategoryBreakdown(period: Period) {
  const q = useLiveQuery(
    db
      .select({
        categoryId: transactions.categoryId,
        amountMinor: sql<number>`COALESCE(SUM(${transactions.amountMinor}),0)`,
        n: count(),
      })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'expense'),
          sql`${transactions.occurredAt} >= ${period.startMs}`,
          sql`${transactions.occurredAt} < ${period.endMsExclusive}`,
        ),
      )
      .groupBy(transactions.categoryId)
      .orderBy(desc(sql`SUM(${transactions.amountMinor})`)),
    [period.startMs, period.endMsExclusive],
  );
  return { rows: q.data, error: q.error, updatedAt: q.updatedAt };
}

/** §26.5 — top 5 expenses in the period by amount, ties broken by most recent. */
export function useLargestExpenses(period: Period, limit = 5) {
  const q = useLiveQuery(
    db
      .select()
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'expense'),
          sql`${transactions.occurredAt} >= ${period.startMs}`,
          sql`${transactions.occurredAt} < ${period.endMsExclusive}`,
        ),
      )
      .orderBy(desc(transactions.amountMinor), desc(transactions.occurredAt))
      .limit(limit),
    [period.startMs, period.endMsExclusive, limit],
  );
  return { rows: q.data, error: q.error, updatedAt: q.updatedAt };
}

/**
 * §26.6 — the "Day by day" chart's data: this period's zero-filled series + mean/median, and
 * the previous period's mean/median for the tile comparison (`null` when the previous period
 * has no expense rows at all, IMP-032 — same "nothing to compare against" convention `useMoMDeltas`
 * already uses, just gated on row presence rather than a derived value being exactly 0).
 */
export function useDailySeries(period: Period) {
  const previous = previousPeriod(period);

  const current = useLiveQuery(
    db
      .select({ occurredAt: transactions.occurredAt, amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'expense'),
          sql`${transactions.occurredAt} >= ${period.startMs}`,
          sql`${transactions.occurredAt} < ${period.endMsExclusive}`,
        ),
      ),
    [period.startMs, period.endMsExclusive],
  );
  const prev = useLiveQuery(
    db
      .select({ occurredAt: transactions.occurredAt, amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'expense'),
          sql`${transactions.occurredAt} >= ${previous.startMs}`,
          sql`${transactions.occurredAt} < ${previous.endMsExclusive}`,
        ),
      ),
    [previous.startMs, previous.endMsExclusive],
  );

  const series = buildDailySeries(current.data, period);
  const hasPreviousData = prev.data.length > 0;
  const previousSeries = hasPreviousData ? buildDailySeries(prev.data, previous) : [];

  return {
    series,
    yMax: dailyChartYMax(series),
    mean: meanDailySpend(series),
    median: medianDailySpend(series),
    previousMean: hasPreviousData ? meanDailySpend(previousSeries) : null,
    previousMedian: hasPreviousData ? medianDailySpend(previousSeries) : null,
    error: current.error ?? prev.error,
    updatedAt: current.updatedAt && prev.updatedAt ? current.updatedAt : undefined,
  };
}
