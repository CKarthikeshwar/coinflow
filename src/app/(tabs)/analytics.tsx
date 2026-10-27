/**
 * FILE PURPOSE
 * ------------
 * The Analytics tab — assembles the spending-insight cards into one scrollable screen (SPEC-UI-UX.md §6.10 /
 * CR-27): period control + Accounts / Categories filter chips → filter banner → "Day by day" (with the daily
 * average) → "Breakdown" (Spent / Income, donut, eye buttons) → "By account" → "Income vs spending" (Month mode)
 * → Biggest expenses. This screen itself mostly wires together the `db/repositories/analytics.ts` hooks and the
 * presentational components in `src/features/analytics/` — the number-crunching lives in those two places.
 *
 * Filters: the chosen accounts and hidden categories live in `stores/analytics-filter.ts` (in memory only — they
 * survive switching period or tab, not closing the app). Every card follows them except the Breakdown list, which
 * keeps showing hidden categories so the eye can bring them back.
 *
 * Mode hydration: `useAnalyticsPeriod` starts on the current month always (its own header
 * explains why — reading the persisted mode at store-creation time would run before
 * `<MigrationGate>` has migrated the DB). This screen reads the persisted
 * `analyticsPeriodMode` once on mount instead, since it only ever renders after the gate has
 * passed, and applies it with `persist:false` (it's just restoring what's already stored, not
 * writing a new choice).
 */

import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/db/repositories/accounts';
import {
  useAccountTotals,
  useCategoryBreakdown,
  useDailySeries,
  useIncomeBreakdown,
  useLargestExpenses,
  useMonthlySeries,
  usePeriodSummary,
} from '@/db/repositories/analytics';
import { getCategoryMap } from '@/db/repositories/categories';
import { getSetting } from '@/db/repositories/settings';
import {
  type AnalyticsFilter,
  type CategoryKind,
  hiddenCount as countHidden,
  isFilterActive,
  NO_ACCOUNT_ID,
} from '@/domain/analytics-filter';
import type { Period } from '@/domain/period';
import { useSheetRegistry } from '@/stores';
import { useAnalyticsFilter } from '@/stores/analytics-filter';
import { useAnalyticsPeriod } from '@/stores/analytics-period';

import { AccountBreakdown } from '@/features/analytics/account-breakdown';
import { BiggestExpenses } from '@/features/analytics/biggest-expenses';
import { CategoryBreakdown } from '@/features/analytics/category-breakdown';
import { DailyChart } from '@/features/analytics/daily-chart';
import { AnalyticsFilterBar, FilterBanner } from '@/features/analytics/filter-bar';
import { IncomeVsSpending } from '@/features/analytics/income-vs-spending';
import { PeriodControl } from '@/features/analytics/period-control';
import { EmptyState } from '@/ui/empty-state';
import { ErrorState } from '@/ui/error-state';
import { Skeleton } from '@/ui/skeleton';
import { TopBar } from '@/ui/top-bar';

export default function AnalyticsScreen() {
  const [retryNonce, setRetryNonce] = useState(0);
  return (
    <SafeAreaView style={styles.safe}>
      <TopBar title="Analytics" />
      <AnalyticsContent key={retryNonce} onRetry={() => setRetryNonce((n) => n + 1)} />
    </SafeAreaView>
  );
}

function AnalyticsContent({ onRetry }: { onRetry: () => void }) {
  const tabBarHeight = useBottomTabBarHeight();
  const openSheet = useSheetRegistry((s) => s.open);
  const { period, setMode, step } = useAnalyticsPeriod();

  const accountIds = useAnalyticsFilter((s) => s.accountIds);
  const hiddenExpense = useAnalyticsFilter((s) => s.hiddenExpense);
  const hiddenIncome = useAnalyticsFilter((s) => s.hiddenIncome);
  const filter = useMemo<AnalyticsFilter>(
    () => ({ accountIds, hiddenExpense, hiddenIncome }),
    [accountIds, hiddenExpense, hiddenIncome],
  );
  const filterActive = isFilterActive(filter);
  const hiddenTotal = countHidden(filter);

  const [kind, setKind] = useState<CategoryKind>('expense');
  const { data: accounts } = useAccounts();

  useEffect(() => {
    // One-time hydration of the persisted mode (see file header) — not a `visible`-style
    // effect loop, `setMode` itself no-ops when the mode already matches.
    const persistedMode = getSetting<Period['mode']>('analyticsPeriodMode', 'month');
    setMode(persistedMode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = usePeriodSummary(period, filter);
  // The Breakdown follows the account filter only — it keeps listing hidden categories (the eye shows them again).
  const breakdown = useCategoryBreakdown(period, filter);
  const incomeBreakdown = useIncomeBreakdown(period, filter);
  const daily = useDailySeries(period, filter);
  const largest = useLargestExpenses(period, 5, filter);
  const accountTotals = useAccountTotals(period, filter);
  const monthly = useMonthlySeries(period, filter);
  const categoryMap = getCategoryMap();

  const error =
    summary.error ?? breakdown.error ?? incomeBreakdown.error ?? daily.error ?? largest.error ?? accountTotals.error ?? monthly.error;
  const loading =
    !error &&
    (summary.updatedAt === undefined ||
      breakdown.updatedAt === undefined ||
      incomeBreakdown.updatedAt === undefined ||
      daily.updatedAt === undefined ||
      largest.updatedAt === undefined ||
      accountTotals.updatedAt === undefined ||
      monthly.updatedAt === undefined);
  const isEmptyPeriod = !loading && !error && summary.spentMinor === 0 && summary.incomeMinor === 0;

  const previousLabel = period.mode === 'week' ? 'Last week' : 'Last month';

  const accountName = (id: string) =>
    id === NO_ACCOUNT_ID ? 'No account' : ((accounts ?? []).find((a) => a.id === id)?.nickname ?? 'Account');
  const accountLabel =
    accountIds.length === 0
      ? 'All accounts'
      : accountIds.length === 1
        ? accountName(accountIds[0])
        : `${accountIds.length} accounts`;
  const filterParts = [
    accountIds.length === 0 ? null : accountIds.length === 1 ? `${accountName(accountIds[0])} only` : `${accountIds.length} accounts`,
    hiddenTotal === 0 ? null : `${hiddenTotal} ${hiddenTotal === 1 ? 'category' : 'categories'} hidden`,
  ].filter((p): p is string => p !== null);

  const toggleAccount = (id: string) =>
    useAnalyticsFilter.getState().setAccounts(accountIds.length === 1 && accountIds[0] === id ? [] : [id]);

  if (error) {
    return <ErrorState message="Couldn't load your analytics." onRetry={onRetry} />;
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + Spacing.three }]}
    >
      {/* The period control and the filter chips always stay pinned at the top, regardless of state below them —
          consistent with every other filter/selector control in the app (never floats to re-position itself
          around empty content). */}
      <PeriodControl period={period} onModeChange={(mode) => setMode(mode)} onStep={step} />
      <AnalyticsFilterBar
        accountLabel={accountLabel}
        accountsActive={accountIds.length > 0}
        hiddenCount={hiddenTotal}
        onAccounts={() => openSheet('analyticsAccounts', {})}
        onCategories={() => openSheet('analyticsCategories', {})}
      />
      {filterActive ? (
        <FilterBanner
          text={`${filterParts.join(' · ')}. Every figure below follows this.`}
          onReset={() => useAnalyticsFilter.getState().reset()}
        />
      ) : null}

      {isEmptyPeriod ? (
        // `EmptyState`'s own root is `flex: 1, justifyContent: 'center'` — as the sole remaining
        // child after the controls here, it naturally centers itself in whatever space is left.
        filterActive ? (
          <EmptyState
            glyph="bar-chart-3"
            line="Nothing left with these filters"
            cta={{ label: 'Show all', onPress: () => useAnalyticsFilter.getState().reset() }}
          />
        ) : (
          <EmptyState
            glyph="bar-chart-3"
            line={`Nothing recorded for ${period.label}`}
            cta={{ label: 'Add transaction', onPress: () => openSheet('add', {}) }}
          />
        )
      ) : loading ? (
        <Skeleton layout="analytics" />
      ) : (
        <>
          <DailyChart
            series={daily.series}
            yMax={daily.yMax}
            mean={daily.mean}
            previousMean={daily.previousMean}
            previousLabel={previousLabel}
            note={filterActive ? filterParts.join(' · ') : undefined}
          />

          <CategoryBreakdown
            rows={kind === 'income' ? incomeBreakdown.rows : breakdown.rows}
            categoryById={categoryMap}
            period={period}
            kind={kind}
            onKindChange={setKind}
            hiddenIds={kind === 'income' ? hiddenIncome : hiddenExpense}
            onToggleHidden={(id) => useAnalyticsFilter.getState().toggleHidden(kind, id)}
            onShowAll={() => useAnalyticsFilter.getState().showAll(kind)}
            accountIds={accountIds}
          />

          <AccountBreakdown
            accounts={accounts ?? []}
            totals={accountTotals.rows}
            selectedIds={accountIds}
            onSelect={toggleAccount}
          />

          {period.mode === 'month' ? <IncomeVsSpending series={monthly.series} /> : null}

          <BiggestExpenses rows={largest.rows} categoryById={categoryMap} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  // `contentContainerStyle`'s `flexGrow:1` only grows into the ScrollView's own bounds — without
  // `style={styles.flex}` on the ScrollView itself, it has no bounded height to grow into, and
  // `EmptyState`'s own `flex: 1` (below) would have nothing to fill/center within.
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.three, gap: Spacing.three },
});
