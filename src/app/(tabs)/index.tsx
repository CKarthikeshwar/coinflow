/**
 * Home — SPEC-UI-UX.md §6.2, SPEC-implementation.md §30.4. F6.5 step 3: the real screen —
 * balance hero (D2/§26.2), Income/Spending tiles with MoM deltas (§26.1/§26.3), the action
 * strip (review + uncategorized, F11/F7), Recent activity (F5's card, ≤8 rows), and the
 * permission banner (V-9) — replacing step 1's "coming soon" stub.
 *
 * Retry mechanism: `useLiveQuery` has no manual refetch, so **Try again** remounts the
 * data-reading subtree via a `key` bump rather than threading a refetch call through every
 * hook — same outcome, simpler mechanism (the project's established pattern for this class of
 * simplification, e.g. `sheet-host.tsx`'s discard-guard).
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { getCategoryMap } from '@/db/repositories/categories';
import type { Transaction } from '@/db/schema';
import {
  useMoMDeltas,
  usePeriodSummary,
  useRunningBalance,
  useUncategorizedCount,
} from '@/db/repositories/analytics';
import { setSetting, useSetting } from '@/db/repositories/settings';
import { usePendingCount } from '@/db/repositories/suggestions';
import { useRecentTransactions } from '@/db/repositories/transactions';
import { usePermissionStatus } from '@/hooks/use-permission-status';
import { requestSmsPermissions } from '@/services/sms';
import { useSheetRegistry } from '@/stores';

import { ActionStripRow } from '@/features/home/action-strip';
import { BalanceHero } from '@/features/home/balance-hero';
import { EmptyState } from '@/ui/empty-state';
import { ErrorState } from '@/ui/error-state';
import { PermissionBanner } from '@/ui/permission-banner';
import { Skeleton } from '@/ui/skeleton';
import { StatTile } from '@/ui/stat-tile';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';
import { TransactionCard } from '@/ui/transaction-card';

export default function HomeScreen() {
  const [retryNonce, setRetryNonce] = useState(0);
  return (
    <SafeAreaView style={styles.safe}>
      <TopBar variant="brand" />
      <HomeContent key={retryNonce} onRetry={() => setRetryNonce((n) => n + 1)} />
    </SafeAreaView>
  );
}

function HomeContent({ onRetry }: { onRetry: () => void }) {
  const tabBarHeight = useBottomTabBarHeight();
  const openSheet = useSheetRegistry((s) => s.open);
  const permission = usePermissionStatus();

  const balance = useRunningBalance();
  const summary = usePeriodSummary();
  const deltas = useMoMDeltas();
  const uncategorized = useUncategorizedCount();
  const pending = usePendingCount();
  const recent = useRecentTransactions(8);
  const categoryMap = getCategoryMap();

  const smsBanner = useSetting<number | null>('smsBannerDismissedAt');
  const notifBanner = useSetting<number | null>('notifBannerDismissedAt');

  const error = balance.error ?? summary.error ?? deltas.error ?? recent.error;
  const loading =
    !error &&
    (balance.updatedAt === undefined || summary.updatedAt === undefined || recent.updatedAt === undefined);
  const isNewUser = !loading && !error && recent.data.length === 0;

  if (error) {
    return <ErrorState message="Couldn't load your data." onRetry={onRetry} />;
  }

  if (loading) {
    return <Skeleton layout="home" />;
  }

  const showSmsBanner = permission.sms === 'denied' && smsBanner.value == null;
  const showNotifBanner = !showSmsBanner && permission.notifications === 'denied' && notifBanner.value == null;

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + Spacing.three }]}>
      {showSmsBanner ? (
        <PermissionBanner
          kind="sms"
          onEnable={async () => {
            await requestSmsPermissions();
            permission.refresh();
          }}
          onDismiss={() => setSetting('smsBannerDismissedAt', Date.now())}
        />
      ) : showNotifBanner ? (
        <PermissionBanner
          kind="notif"
          onEnable={async () => {
            await Notifications.requestPermissionsAsync();
            permission.refresh();
          }}
          onDismiss={() => setSetting('notifBannerDismissedAt', Date.now())}
        />
      ) : null}

      <BalanceHero balanceMinor={balance.balanceMinor} />

      <View style={styles.tileRow}>
        <StatTile
          label="Income"
          valueMinor={summary.incomeMinor}
          deltaPct={deltas.incomeDeltaPct}
          deltaLabel="vs last month"
        />
        <StatTile
          label="Spending"
          valueMinor={summary.spentMinor}
          deltaPct={deltas.spendingDeltaPct}
          deltaLabel="vs last month"
        />
      </View>

      {isNewUser ? null : (
        <View style={styles.strip}>
          <ActionStripRow kind="review" count={pending.count} onPress={() => router.push('/review-queue')} />
          <ActionStripRow
            kind="uncat"
            count={uncategorized.count}
            onPress={() => router.push('/transactions?filter=uncategorized')}
          />
        </View>
      )}

      <View style={styles.recentHeader}>
        <ThemedText type="title">Recent</ThemedText>
        {isNewUser ? null : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/transactions')}>
            <ThemedText type="label" themeColor="text">
              See all
            </ThemedText>
          </Pressable>
        )}
      </View>

      {isNewUser ? (
        <EmptyState
          glyph="receipt"
          line="No transactions yet — they'll appear here as you pay."
          cta={{ label: 'Add transaction', onPress: () => openSheet('add', {}) }}
        />
      ) : (
        <View style={styles.recentList}>
          {recent.data.map((txn: Transaction) => (
            <TransactionCard
              key={txn.id}
              txn={txn}
              showTime
              category={txn.categoryId ? (categoryMap.get(txn.categoryId) ?? null) : null}
              onPress={() => router.push(`/transaction/${txn.id}`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  tileRow: { flexDirection: 'row', gap: Spacing.two },
  strip: { gap: Spacing.half },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentList: { gap: Spacing.two },
});
