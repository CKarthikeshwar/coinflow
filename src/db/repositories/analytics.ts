/**
 * analyticsRepo — SPEC-implementation.md §21.5 / §26. Live aggregates over `transaction`.
 * This is Home's slice only (F6.5): all-time running balance, this-period Spent/Income, MoM
 * deltas, and the all-time uncategorized count. The rest of §26 — by-category, largest
 * expenses, the daily series, mean/median, week mode — is F9's Analytics screen.
 */

import { and, count, eq, isNull, sql } from 'drizzle-orm';

import { percentDelta } from '@/domain/analytics';
import { monthPeriod, previousMonthPeriod, type Period } from '@/domain/period';
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

/** §26.3 — this month vs. last month; each `null` when there's no prior-month figure. */
export function useMoMDeltas(period: Period = monthPeriod()) {
  const current = usePeriodSummary(period);
  const previous = usePeriodSummary(previousMonthPeriod(period));
  return {
    spendingDeltaPct: percentDelta(current.spentMinor, previous.spentMinor),
    incomeDeltaPct: percentDelta(current.incomeMinor, previous.incomeMinor),
    error: current.error ?? previous.error,
    updatedAt: current.updatedAt && previous.updatedAt ? current.updatedAt : undefined,
  };
}

/**
 * §26.8 — unscoped (all-time), for the Home action-strip row. Analytics' period-scoped
 * "Fix N" (F9) is a separate call with a `period` once that screen exists.
 */
export function useUncategorizedCount() {
  const q = useLiveQuery(
    db
      .select({ n: count() })
      .from(transactions)
      .where(and(isNull(transactions.deletedAt), eq(transactions.type, 'expense'), isNull(transactions.categoryId))),
  );
  return { count: q.data[0]?.n ?? 0, error: q.error, updatedAt: q.updatedAt };
}
