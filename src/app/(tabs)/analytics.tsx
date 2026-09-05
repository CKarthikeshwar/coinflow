/**
 * FILE PURPOSE
 * ------------
 * The Analytics tab — assembles all the spending-insight components into one scrollable screen:
 * period control (Month/Week + stepper) → balance arc → Mean/Median tiles → "Where it went"
 * (category donut + list) → "Day by day" (daily chart) → Biggest expenses. This screen itself
 * mostly wires together the `db/repositories/analytics.ts` hooks and the presentational
 * components in `src/features/analytics/` — the actual number-crunching lives in those two
 * places, not here.
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
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + Spacing.three }]}
    >
      {/* The period control always stays pinned at the top, regardless of state below it —
          consistent with every other filter/selector control in the app (never floats to
          re-position itself around empty content). */}
      <PeriodControl period={period} onModeChange={(mode) => setMode(mode)} onStep={step} />

      {isEmptyPeriod ? (
        // `EmptyState`'s own root is `flex: 1, justifyContent: 'center'` — as the sole remaining
        // child after `PeriodControl` here, it naturally centers itself in whatever space is left.
        <EmptyState
          glyph="bar-chart-3"
          line={`Nothing recorded for ${period.label}`}
          cta={{ label: 'Add transaction', onPress: () => openSheet('add', {}) }}
        />
      ) : loading ? (
        <Skeleton layout="analytics" />
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
  // `contentContainerStyle`'s `flexGrow:1` only grows into the ScrollView's own bounds — without
  // `style={styles.flex}` on the ScrollView itself, it has no bounded height to grow into, and
  // `EmptyState`'s own `flex: 1` (below) would have nothing to fill/center within.
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.three, gap: Spacing.three },
  tileRow: { flexDirection: 'row', gap: Spacing.two },
});
