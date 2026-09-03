/**
 * Analytics — SPEC-UI-UX.md §6.10, SPEC-implementation.md §30.12. F9. Period control (Month/
 * Week + stepper) → "This month" balance arc → Mean/Median tiles → "Where it went" (category
 * donut + list) → "Day by day" (daily chart) → Biggest expenses.
 *
 * Mode hydration: `useAnalyticsPeriod` starts on the current month always (its own header
 * explains why — reading the persisted mode at store-creation time would run before
 * `<MigrationGate>` has migrated the DB). This screen reads the persisted
 * `analyticsPeriodMode` once on mount instead, since it only ever renders after the gate has
 * passed, and applies it with `persist:false` (it's just restoring what's already stored, not
 * writing a new choice).
 *
 * `useCategoryBreakdown`'s own `categoryId: null` row already carries the "Fix N" count
 * `CategoryBreakdown` needs — the repo's `useUncategorizedCount(period)` overload exists
 * (symmetric with Home's unscoped call) but isn't called a second time here for the same number.
 */

import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { getCategoryMap } from '@/db/repositories/categories';
import { getSetting } from '@/db/repositories/settings';
import {
  useCategoryBreakdown,
  useDailySeries,
  useLargestExpenses,
  usePeriodSummary,
} from '@/db/repositories/analytics';
import type { Period } from '@/domain/period';
import { useAnalyticsPeriod } from '@/stores/analytics-period';
import { useSheetRegistry } from '@/stores';

import { BalanceArcCard } from '@/features/analytics/balance-arc-card';
import { BiggestExpenses } from '@/features/analytics/biggest-expenses';
import { CategoryBreakdown } from '@/features/analytics/category-breakdown';
import { DailyChart } from '@/features/analytics/daily-chart';
import { MeanMedianTile } from '@/features/analytics/mean-median-tile';
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

  useEffect(() => {
    // One-time hydration of the persisted mode (see file header) — not a `visible`-style
    // effect loop, `setMode` itself no-ops when the mode already matches.
    const persistedMode = getSetting<Period['mode']>('analyticsPeriodMode', 'month');
    setMode(persistedMode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = usePeriodSummary(period);
  const breakdown = useCategoryBreakdown(period);
  const daily = useDailySeries(period);
  const largest = useLargestExpenses(period);
  const categoryMap = getCategoryMap();

  const error = summary.error ?? breakdown.error ?? daily.error ?? largest.error;
  const loading =
    !error &&
    (summary.updatedAt === undefined ||
      breakdown.updatedAt === undefined ||
      daily.updatedAt === undefined ||
      largest.updatedAt === undefined);
  const isEmptyPeriod = !loading && !error && summary.spentMinor === 0 && summary.incomeMinor === 0;

  const previousLabel = period.mode === 'week' ? 'Last week' : 'Last month';

  if (error) {
    return <ErrorState message="Couldn't load your analytics." onRetry={onRetry} />;
  }

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + Spacing.three }]}>
      <PeriodControl period={period} onModeChange={(mode) => setMode(mode)} onStep={step} />

      {loading ? (
        <Skeleton layout="analytics" />
      ) : isEmptyPeriod ? (
        <EmptyState
          glyph="bar-chart-3"
          line={`Nothing recorded for ${period.label}`}
          cta={{ label: 'Add transaction', onPress: () => openSheet('add', {}) }}
        />
      ) : (
        <>
          <BalanceArcCard incomeMinor={summary.incomeMinor} spentMinor={summary.spentMinor} />

          <View style={styles.tileRow}>
            <MeanMedianTile
              label="Mean"
              valueMinor={daily.mean}
              previousValueMinor={daily.previousMean}
              previousLabel={previousLabel}
            />
            <MeanMedianTile
              label="Median"
              valueMinor={daily.median}
              previousValueMinor={daily.previousMedian}
              previousLabel={previousLabel}
            />
          </View>

          <CategoryBreakdown rows={breakdown.rows} categoryById={categoryMap} period={period} />

          <DailyChart series={daily.series} yMax={daily.yMax} mean={daily.mean} />

          <BiggestExpenses rows={largest.rows} categoryById={categoryMap} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  tileRow: { flexDirection: 'row', gap: Spacing.two },
});
