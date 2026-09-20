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
 * V2 — EFFECTIVE AMOUNTS (SPEC-implementation.md §41, CR-17, IMP-073 / IMP-074 / IMP-096)
 * ---------------------------------------------------------------------------------------
 * Since split payments, "how much was this transaction" has two answers: what left your bank
 * (the transaction's `amountMinor`, shown on lists and Details) and what it *really cost you*.
 * Every total here uses the second — `effectiveAmountSql`:
 *   - an expense you shared counts only your part: `amount − Σ non-waived shares`;
 *   - an income that settled somebody's share counts only the unused part:
 *     `amount − Σ share-settlements` (settlement money is not income);
 *   - a debit that pays a request you owe is a genuine expense and is NOT reduced.
 * With no splits every expression collapses to `amountMinor`, so V1 results are unchanged (IMP-073).
 * The queries are exported as `*Query` factories (the hooks just wrap them) so tests can run the real
 * SQL against a real database.
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

import { and, count, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';

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
import { settlements, splitShares, splits, transactions } from '../schema';

/**
 * §41 — what a transaction *effectively* is, as a SQL expression over the outer `transaction` row
 * (never negative). Table names are written out in full on purpose: Drizzle omits the table qualifier in
 * single-table selects, and inside a sub-select an unqualified `id` would silently bind to `split.id`
 * (caught by the real-SQL tests). Valid only in queries `FROM "transaction"` (unaliased). The correlated
 * sub-selects hit `uniq_split_txn` / `idx_settlement_txn`, so on a database with no splits each costs
 * one empty index probe per row.
 */
export const effectiveAmountSql = sql<number>`MAX(0, CASE
  WHEN "transaction"."type" = 'expense' THEN "transaction"."amountMinor" - COALESCE((
    SELECT SUM("split_share"."amountMinor") FROM "split"
    INNER JOIN "split_share" ON "split_share"."splitId" = "split"."id" AND "split_share"."waivedAt" IS NULL
    WHERE "split"."transactionId" = "transaction"."id"), 0)
  WHEN "transaction"."type" = 'income' THEN "transaction"."amountMinor" - COALESCE((
    SELECT SUM("settlement"."amountMinor") FROM "settlement"
    WHERE "settlement"."transactionId" = "transaction"."id" AND "settlement"."shareId" IS NOT NULL), 0)
  ELSE "transaction"."amountMinor" END)`;

/**
 * Changes whenever ANY split, share or settlement changes (V2). Drizzle's `useLiveQuery` re-runs a query only
 * when its *main* table (`transaction`) changes — but `effectiveAmountSql` also reads the split tables, so
 * splitting / waiving / settling would leave Home and Analytics stale until the next app start (found on-device).
 * Adding this to every effective-amount hook's `deps` makes them re-run.
 */
export function useSplitChangeSignal(): number {
  const a = useLiveQuery(db.select({ id: splits.id }).from(splits));
  const b = useLiveQuery(db.select({ id: splitShares.id }).from(splitShares));
  const c = useLiveQuery(db.select({ id: settlements.id }).from(settlements));
  return (a.updatedAt?.getTime() ?? 0) + (b.updatedAt?.getTime() ?? 0) + (c.updatedAt?.getTime() ?? 0);
}

const inPeriod = (period: Period) => [
  sql`${transactions.occurredAt} >= ${period.startMs}`,
  sql`${transactions.occurredAt} < ${period.endMsExclusive}`,
];

/** §26.2 — all-time effective balance: Σ income − Σ expense, both effective (D2, IMP-096). */
export function runningBalanceQuery() {
  return db
    .select({
      balanceMinor: sql<number>`COALESCE(SUM(CASE ${transactions.type} WHEN 'income' THEN ${effectiveAmountSql} WHEN 'expense' THEN -(${effectiveAmountSql}) END), 0)`,
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt));
}

/** §26.2 — the all-time computed net (D2). Never an SMS "Avl Bal" read. May be negative. */
export function useRunningBalance() {
  const signal = useSplitChangeSignal();
  const q = useLiveQuery(runningBalanceQuery(), [signal]);
  return { balanceMinor: q.data[0]?.balanceMinor ?? 0, error: q.error, updatedAt: q.updatedAt };
}

/** §26.1 — effective Spent / Income for one period. */
export function periodSummaryQuery(period: Period) {
  return db
    .select({
      spentMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${effectiveAmountSql} END), 0)`,
      incomeMinor: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${effectiveAmountSql} END), 0)`,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), ...inPeriod(period)));
}

/** §26.1 — Spent / Income for one period. Defaults to the current calendar month. */
export function usePeriodSummary(period: Period = monthPeriod()) {
  const signal = useSplitChangeSignal();
  const q = useLiveQuery(periodSummaryQuery(period), [period.startMs, period.endMsExclusive, signal]);
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
 * (e.g. an old uncategorized expense outside the current period). Counts transactions, not
 * money, so it is unaffected by splits.
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
          ...(period ? inPeriod(period) : []),
        ),
      ),
    period ? [period.startMs, period.endMsExclusive] : [],
  );
  return { count: q.data[0]?.n ?? 0, error: q.error, updatedAt: q.updatedAt };
}

/** §26.4 — effective spend per category. Expenses whose effective amount is 0 (fully covered by others) are left out. */
export function categoryBreakdownQuery(period: Period) {
  return db
    .select({
      categoryId: transactions.categoryId,
      amountMinor: sql<number>`COALESCE(SUM(${effectiveAmountSql}),0)`,
      n: count(),
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'),
        ...inPeriod(period),
        sql`${effectiveAmountSql} > 0`,
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`SUM(${effectiveAmountSql})`));
}

/** §26.4 — "Where it went". `categoryId: null` is the Uncategorized bucket (own row, hatched,
 * IMP-033), ordered by spend descending. */
export function useCategoryBreakdown(period: Period) {
  const signal = useSplitChangeSignal();
  const q = useLiveQuery(categoryBreakdownQuery(period), [period.startMs, period.endMsExclusive, signal]);
  return { rows: q.data, error: q.error, updatedAt: q.updatedAt };
}

/** §26.5 — expenses ranked by *effective* amount, ties by most recent; each row's `amountMinor` is the effective amount. */
export function largestExpensesQuery(period: Period, limit = 5) {
  return db
    .select({ ...getTableColumns(transactions), amountMinor: effectiveAmountSql })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'),
        ...inPeriod(period),
        sql`${effectiveAmountSql} > 0`,
      ),
    )
    .orderBy(desc(effectiveAmountSql), desc(transactions.occurredAt))
    .limit(limit);
}

/** §26.5 — top 5 expenses in the period by amount, ties broken by most recent. A shared expense ranks
 * (and shows) at what it cost *you*, consistent with the Spent total (§41). */
export function useLargestExpenses(period: Period, limit = 5) {
  const signal = useSplitChangeSignal();
  const q = useLiveQuery(largestExpensesQuery(period, limit), [period.startMs, period.endMsExclusive, limit, signal]);
  return { rows: q.data, error: q.error, updatedAt: q.updatedAt };
}

/** Effective expense rows (date + amount) for one period, feeding the daily series. */
export function dailyExpenseRowsQuery(period: Period) {
  return db
    .select({ occurredAt: transactions.occurredAt, amountMinor: effectiveAmountSql })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'),
        ...inPeriod(period),
        sql`${effectiveAmountSql} > 0`,
      ),
    );
}

/**
 * §26.6 — the "Day by day" chart's data: this period's zero-filled series + mean/median, and
 * the previous period's mean/median for the tile comparison (`null` when the previous period
 * has no expense rows at all, IMP-032 — same "nothing to compare against" convention `useMoMDeltas`
 * already uses, just gated on row presence rather than a derived value being exactly 0).
 */
export function useDailySeries(period: Period) {
  const previous = previousPeriod(period);

  const signal = useSplitChangeSignal();
  const current = useLiveQuery(dailyExpenseRowsQuery(period), [period.startMs, period.endMsExclusive, signal]);
  const prev = useLiveQuery(dailyExpenseRowsQuery(previous), [previous.startMs, previous.endMsExclusive, signal]);

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
