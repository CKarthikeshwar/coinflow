/**
 * FILE PURPOSE
 * ------------
 * The Home tab — the app's default landing screen. Shows the running balance, this month's
 * income/spending with month-over-month change, quick links to the Review Queue and
 * uncategorized transactions, a short recent-activity list, and a banner nudging the user to
 * enable SMS/notification permissions if they're off. Everything on this screen is read-only
 * (aside from the permission-request/dismiss actions) — all the actual data comes from the
 * `db/repositories/analytics.ts` and `db/repositories/transactions.ts` live-query hooks, so it
 * updates automatically the instant a transaction changes anywhere in the app.
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
import { useSplitBadges, useSplitsOverview } from '@/db/repositories/split-hooks';
import { useRecentTransactions } from '@/db/repositories/transactions';
import { usePermissionStatus } from '@/hooks/use-permission-status';
import { requestSmsPermissions } from '@/services/sms';
import { useSheetRegistry } from '@/stores';

import { useAccounts } from '@/db/repositories/accounts';
import { useAccountViews } from '@/db/repositories/balances';
import { totalBalance } from '@/domain/accounts/balance';
import { formatWhen } from '@/domain/format/when';
import { NeedsALookCards } from '@/features/accounts/needs-a-look-cards';
import { useAccountLabels } from '@/features/accounts/use-account-labels';
import { ActionStripRow } from '@/features/home/action-strip';
import { BalanceHero } from '@/features/home/balance-hero';
import { OwedToYouRow } from '@/features/home/owed-row';
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
  const accountLabels = useAccountLabels(recent.data); // CR-34 (UI-109)
  // CR-34 (UI-109) — the real total of your accounts once any balance is known; before that, the recorded net
  const { data: myAccountRows } = useAccounts();
  const accountViews = useAccountViews(myAccountRows ?? []);
  const myTotal = totalBalance(
    accountViews.map((v) => ({ kind: v.account.kind, archived: v.account.archivedAt !== null, balance: v.balance })),
  );
  const splitBadges = useSplitBadges(); // V2 (UI-075): "Split · 1 of 3 paid" on shared transactions
  const owed = useSplitsOverview(); // V2 (UI-081): the "Owed to you ₹N" row, only while N > 0
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

      {/* UI-103 — the balance card opens My accounts */}
      <Pressable accessibilityRole="button" accessibilityLabel="My accounts" onPress={() => router.push('/my-accounts' as never)}>
        {myTotal.knownCount > 0 ? (
          <BalanceHero
            balanceMinor={myTotal.totalMinor}
            caption={`across ${myTotal.knownCount} account${myTotal.knownCount === 1 ? '' : 's'}${
              myTotal.oldestAsOf !== null ? ` · oldest figure ${formatWhen(myTotal.oldestAsOf)}` : ''
            }`}
          />
        ) : (
          <BalanceHero balanceMinor={balance.balanceMinor} label="Recorded net" />
        )}
      </Pressable>
      <NeedsALookCards views={accountViews} />

      <View style={styles.tileRow}>
        <StatTile
          label="Income"
          valueMinor={summary.incomeMinor}
          deltaPct={deltas.incomeDeltaPct}
          deltaLabel="vs last month"
        />
        <StatTile
          label="Spending"
          valueMinor={-summary.spentMinor} // §6.2: spending reads "− ₹…" (was "+ ₹…", CR-19)
          deltaPct={deltas.spendingDeltaPct}
          deltaLabel="vs last month"
        />
      </View>

      <OwedToYouRow amountMinor={owed.owedTotalMinor} onPress={() => router.push('/splits')} />
      <ActionStripRow kind="requests" count={owed.unattended.length} onPress={() => router.push('/splits?tab=requests')} />

      {/* Not gated on `isNewUser`: SMS detection can queue suggestions before any transaction is saved. */}
      <View style={styles.strip}>
        <ActionStripRow kind="review" count={pending.count} onPress={() => router.push('/review-queue')} />
        <ActionStripRow
          kind="uncat"
          count={uncategorized.count}
          onPress={() => router.push('/transactions?uncategorized=1')}
        />
      </View>

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
              split={splitBadges.get(txn.id)}
              accountLabel={accountLabels.account(txn)}
              transferLabel={accountLabels.transfer(txn)}
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
