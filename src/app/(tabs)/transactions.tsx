/**
 * FILE PURPOSE
 * ------------
 * The full transaction ledger — search, filter, and a scrollable, day-grouped list of every
 * transaction. This is the screen backing the "Transactions" tab. Row taps navigate to
 * `src/app/transaction/[id].tsx` (Details); the Filter button opens
 * `src/features/transactions/filter-sheet.tsx`.
 *
 * Filter (§6.9): the applied filter lives in this route's own params (`filter-draft.ts`'s header
 * comment), read here via `useLocalSearchParams` and merged into `useTransactionList`'s query —
 * the query side (`categoryIds`/`type`/`methods`/`from`/`to`) already existed, unused, since F5's
 * own first pass. The Filter button opens the sheet seeded with the currently-applied filter (so
 * reopening it round-trips the same selection); Apply calls `router.setParams` on this same
 * route, which is why no extra plumbing back from the sheet is needed.
 *
 * Deferred for this pass (documented, not silent — see `SPEC/traceability.md`):
 *  - Delete is a per-row button, not a swipe gesture — same tap-not-swipe simplification used
 *    for Review Queue's dismiss.
 */

import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { Spacing } from '@/constants/theme';
import { getCategoryMap, useCategories } from '@/db/repositories/categories';
import { useTransactionList } from '@/db/repositories/transactions';
import type { PaymentMethod, Transaction } from '@/db/schema';
import { startOfLocalDay } from '@/domain/period';
import { parseFilterParams, type RawFilterParams } from '@/features/transactions/filter-params';
import { useSheetRegistry } from '@/stores';

import { Badge } from '@/ui/badge';
import { Chip } from '@/ui/chip';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { Skeleton } from '@/ui/skeleton';
import { TextField } from '@/ui/text-field';
import { TopBar } from '@/ui/top-bar';
import { TransactionCard } from '@/ui/transaction-card';
import { DayGroupHeader } from '@/ui/day-group-header';

type ListItem =
  | { kind: 'header'; key: string; dayStartMs: number; subtotalMinor: number }
  | { kind: 'row'; key: string; txn: Transaction };

function formatShort(ms: number): string {
  return format(ms, 'd MMM');
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  bank_transfer: 'Bank',
  wallet: 'Wallet',
};

export default function TransactionsScreen() {
  const [search, setSearch] = useState('');
  // The tab bar floats over content (F6.5's `CoinFlowTabBar`) rather than docking and
  // reserving its own space, so the list's own bottom padding has to account for it.
  const tabBarHeight = useBottomTabBarHeight();
  const rawParams = useLocalSearchParams<RawFilterParams>();
  const filter = useMemo(() => parseFilterParams(rawParams), [rawParams]);
  const { data: categories } = useCategories();

  const { rows, daySubtotals, updatedAt } = useTransactionList({
    search: search.trim() || undefined,
    categoryIds: filter.categoryIds.length ? filter.categoryIds : undefined,
    uncategorized: filter.uncategorized || undefined,
    type: filter.type,
    methods: filter.methods.length ? filter.methods : undefined,
    from: filter.from,
    to: filter.to,
  });
  const openSheet = useSheetRegistry((s) => s.open);

  // Sync + cheap — just re-read every render rather than fighting exhaustive-deps over an
  // intentional "recompute when rows changed" memo that doesn't actually read `rows`.
  const categoryMap = getCategoryMap();

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (filter.uncategorized) {
      chips.push({ key: 'uncategorized', label: 'Uncategorized', clear: () => router.setParams({ uncategorized: '' }) });
    }
    for (const id of filter.categoryIds) {
      const name = (categories ?? []).find((c) => c.id === id)?.name ?? 'Category';
      chips.push({
        key: `cat-${id}`,
        label: name,
        clear: () => router.setParams({ categoryIds: filter.categoryIds.filter((c) => c !== id).join(',') }),
      });
    }
    if (filter.type) {
      chips.push({
        key: 'type',
        label: filter.type === 'income' ? 'Income' : 'Expense',
        clear: () => router.setParams({ type: '' }),
      });
    }
    for (const m of filter.methods) {
      chips.push({
        key: `method-${m}`,
        label: METHOD_LABEL[m],
        clear: () => router.setParams({ methods: filter.methods.filter((x) => x !== m).join(',') }),
      });
    }
    if (filter.from != null || filter.to != null) {
      const label =
        filter.from != null && filter.to != null
          ? `${formatShort(filter.from)} – ${formatShort(filter.to)}`
          : filter.from != null
            ? `Since ${formatShort(filter.from)}`
            : `Until ${formatShort(filter.to!)}`;
      chips.push({ key: 'range', label, clear: () => router.setParams({ from: '', to: '' }) });
    }
    return chips;
  }, [filter, categories]);

  const clearAllFilters = () =>
    router.setParams({ categoryIds: '', uncategorized: '', type: '', methods: '', from: '', to: '' });

  const items = useMemo<ListItem[]>(() => {
    const subtotalByDay = new Map(daySubtotals.map((d) => [d.dayStartMs, d.spentMinor]));
    const out: ListItem[] = [];
    let lastDay: number | null = null;
    for (const txn of rows) {
      const day = startOfLocalDay(txn.occurredAt);
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
  const hasNarrowing = hasSearch || activeChips.length > 0;

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar
        title="Transactions"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filter"
            onPress={() =>
              openSheet('filter', {
                categoryIds: filter.categoryIds,
                uncategorized: filter.uncategorized,
                type: filter.type,
                methods: filter.methods,
                from: filter.from,
                to: filter.to,
              })
            }
            style={styles.filterTap}
          >
            <Icon name="filter" size={18} color={activeChips.length > 0 ? 'primary' : 'text'} />
            {activeChips.length > 0 ? <Badge count={activeChips.length} /> : null}
          </Pressable>
        }
      />
      <View style={styles.searchWrap}>
        <TextField value={search} onChangeText={setSearch} placeholder="Search note, description, account" />
      </View>
      {activeChips.length > 0 ? (
        <View style={styles.chipsWrap}>
          {activeChips.map((c) => (
            <Chip key={c.key} label={c.label} onRemove={c.clear} />
          ))}
        </View>
      ) : null}

      {loading ? (
        <Skeleton layout="transaction-list" />
      ) : !hasData ? (
        hasNarrowing ? (
          <EmptyState
            glyph="search"
            line="No transactions match."
            cta={{
              label: 'Clear filters',
              onPress: () => {
                setSearch('');
                clearAllFilters();
              },
            }}
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
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + Spacing.three }]}
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
  filterTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    paddingHorizontal: Spacing.one,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five },
  rowWrap: { paddingBottom: Spacing.two },
});
