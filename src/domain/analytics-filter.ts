/**
 * The Analytics tab's two filters (SPEC-UI-UX.md §6.10 / CR-27, SPEC-implementation.md CR-40): which
 * accounts to look at, and which categories to hide. Pure types and helpers — the SQL that applies
 * them lives in `db/repositories/analytics.ts`, the in-memory store in `stores/analytics-filter.ts`.
 */

/** Stands for `accountId IS NULL` (cash, and entries not linked to an account) in `accountIds`. */
export const NO_ACCOUNT_ID = 'none';

/** Stands for `categoryId IS NULL` in the hidden-category lists. */
export const UNCATEGORIZED_ID = 'uncategorized';

export type AnalyticsFilter = {
  /** Empty = all accounts. */
  accountIds: string[];
  /** Categories hidden from spending figures. */
  hiddenExpense: string[];
  /** Categories hidden from income figures. */
  hiddenIncome: string[];
};

export const EMPTY_FILTER: AnalyticsFilter = { accountIds: [], hiddenExpense: [], hiddenIncome: [] };

export type CategoryKind = 'expense' | 'income';

/** Category id as the filter stores it: `null` (uncategorized) becomes {@link UNCATEGORIZED_ID}. */
export function filterKey(categoryId: string | null): string {
  return categoryId ?? UNCATEGORIZED_ID;
}

export function hiddenFor(filter: AnalyticsFilter, kind: CategoryKind): string[] {
  return kind === 'expense' ? filter.hiddenExpense : filter.hiddenIncome;
}

export function hiddenCount(filter: AnalyticsFilter): number {
  return filter.hiddenExpense.length + filter.hiddenIncome.length;
}

export function isFilterActive(filter: AnalyticsFilter): boolean {
  return filter.accountIds.length > 0 || hiddenCount(filter) > 0;
}

/** A stable string for hook dependency arrays. */
export function filterSignature(filter: AnalyticsFilter): string {
  return `${filter.accountIds.join(',')}|${filter.hiddenExpense.join(',')}|${filter.hiddenIncome.join(',')}`;
}

/** Flip one id in a list (add if missing, drop if present). */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
