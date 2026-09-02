/**
 * Transactions list — SPEC-UI-UX.md §6.7, SPEC-implementation.md §30.9. F5.
 *
 * Root-relative navigation (flat under `src/app/`, not `(tabs)/`) since the full route tree
 * isn't built yet — same pattern as `review-queue.tsx`.
 *
 * Deferred for this pass (documented, not silent — see `SPEC/traceability.md`):
 *  - No Filter sheet / filter chips — search alone covers a lot of the value; filtering is a
 *    separate, smaller follow-up.
 *  - Delete is a per-row button, not a swipe gesture — same tap-not-swipe simplification used
 *    for Review Queue's dismiss.
 */

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { Spacing } from '@/constants/theme';
import { getCategoryMap } from '@/db/repositories/categories';
import { useTransactionList } from '@/db/repositories/transactions';
import type { Transaction } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import { EmptyState } from '@/ui/empty-state';
import { Skeleton } from '@/ui/skeleton';
import { TextField } from '@/ui/text-field';
import { TopBar } from '@/ui/top-bar';
import { TransactionCard } from '@/ui/transaction-card';
import { DayGroupHeader } from '@/ui/day-group-header';

function localDayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type ListItem =
  | { kind: 'header'; key: string; dayStartMs: number; subtotalMinor: number }
  | { kind: 'row'; key: string; txn: Transaction };

export default function TransactionsScreen() {
  const [search, setSearch] = useState('');
  const { rows, daySubtotals, updatedAt } = useTransactionList({ search: search.trim() || undefined });
  const openSheet = useSheetRegistry((s) => s.open);

  // Sync + cheap — just re-read every render rather than fighting exhaustive-deps over an
  // intentional "recompute when rows changed" memo that doesn't actually read `rows`.
  const categoryMap = getCategoryMap();

  const items = useMemo<ListItem[]>(() => {
    const subtotalByDay = new Map(daySubtotals.map((d) => [d.dayStartMs, d.spentMinor]));
    const out: ListItem[] = [];
    let lastDay: number | null = null;
    for (const txn of rows) {
      const day = localDayStart(txn.occurredAt);
      if (day !== lastDay) {
        out.push({ kind: 'header', key: `h-${day}`, dayStartMs: day, subtotalMinor: subtotalByDay.get(day) ?? 0 });
        lastDay = day;
      }
      out.push({ kind: 'row', key: txn.id, txn });
    }
    return out;
  }, [rows, daySubtotals]);

  const loading = updatedAt === undefined;
  const hasData = rows.length > 0;
  const hasSearch = search.trim().length > 0;

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Transactions" onBack={() => router.back()} />
      <View style={styles.searchWrap}>
        <TextField value={search} onChangeText={setSearch} placeholder="Search note, description, account" />
      </View>

      {loading ? (
        <Skeleton layout="transaction-list" />
      ) : !hasData ? (
        hasSearch ? (
          <EmptyState
            glyph="search"
            line="No transactions match."
            cta={{ label: 'Clear search', onPress: () => setSearch('') }}
          />
        ) : (
          <EmptyState
            glyph="receipt"
            line="No transactions yet."
            cta={{ label: 'Add transaction', onPress: () => openSheet('add', {}) }}
          />
        )
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <DayGroupHeader dayStartMs={item.dayStartMs} subtotalMinor={item.subtotalMinor} />
            ) : (
              <View style={styles.rowWrap}>
                <TransactionCard
                  txn={item.txn}
                  category={item.txn.categoryId ? (categoryMap.get(item.txn.categoryId) ?? null) : null}
                  onPress={() => router.push(`/transaction/${item.txn.id}`)}
                />
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchWrap: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five },
  rowWrap: { paddingBottom: Spacing.two },
});
