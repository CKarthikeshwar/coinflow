/**
 * `AnalyticsCategoriesSheet` — SPEC-UI-UX.md §6.10 (CR-27). Spent / Income tabs, each a checklist of the categories
 * with money in the shown period (and under the chosen accounts): ticked = shown, unticked = hidden from the chart and
 * every figure on the page. **Only** keeps just one; Reset shows everything. Spending and income are hidden
 * independently. Keeps a local draft and writes the Analytics filter store on Apply.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryPalette, Colors, Spacing } from '@/constants/theme';
import { getCategoryMap } from '@/db/repositories/categories';
import { useCategoryBreakdown, useIncomeBreakdown } from '@/db/repositories/analytics';
import { type CategoryKind, EMPTY_FILTER, filterKey, toggleId } from '@/domain/analytics-filter';
import { resolveCategoryColor, shareOf } from '@/domain/analytics';
import { formatMoney } from '@/domain/format/money';
import { useSheetRegistry } from '@/stores';
import { useAnalyticsFilter } from '@/stores/analytics-filter';
import { useAnalyticsPeriod } from '@/stores/analytics-period';

import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { SegmentedControl } from '@/ui/segmented-control';
import { ThemedText } from '@/ui/themed-text';

const KIND_OPTIONS = [
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Income' },
] as const;

export function AnalyticsCategoriesSheet() {
  const close = useSheetRegistry((s) => s.close);
  const period = useAnalyticsPeriod((s) => s.period);
  const accountIds = useAnalyticsFilter((s) => s.accountIds);

  const [kind, setKind] = useState<CategoryKind>('expense');
  const [hiddenExpense, setHiddenExpense] = useState<string[]>(() => useAnalyticsFilter.getState().hiddenExpense);
  const [hiddenIncome, setHiddenIncome] = useState<string[]>(() => useAnalyticsFilter.getState().hiddenIncome);

  // The lists show what is in the period under the chosen accounts, with nothing hidden — hidden rows must stay listed.
  const listFilter = { ...EMPTY_FILTER, accountIds };
  const spent = useCategoryBreakdown(period, listFilter);
  const income = useIncomeBreakdown(period, listFilter);
  const categoryById = getCategoryMap();

  const rows = kind === 'expense' ? spent.rows : income.rows;
  const hidden = kind === 'expense' ? hiddenExpense : hiddenIncome;
  const setHidden = kind === 'expense' ? setHiddenExpense : setHiddenIncome;
  const total = rows.reduce((sum, r) => sum + r.amountMinor, 0);
  const hiddenTotal = hiddenExpense.length + hiddenIncome.length;

  const only = (id: string) => setHidden(rows.map((r) => filterKey(r.categoryId)).filter((x) => x !== id));

  const apply = () => {
    const store = useAnalyticsFilter.getState();
    store.setHidden('expense', hiddenExpense);
    store.setHidden('income', hiddenIncome);
    close();
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.root}>
      <ThemedText type="title" style={styles.title}>
        Categories
      </ThemedText>
      <View style={styles.pad}>
        <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} />
      </View>
      <ThemedText type="caption" themeColor="text3" style={styles.head}>
        Ticked categories are shown in the chart and the figures
      </ThemedText>

      {rows.length === 0 ? (
        <ThemedText type="body" themeColor="text3" style={styles.empty}>
          Nothing recorded for this period.
        </ThemedText>
      ) : null}

      {rows.map((r) => {
        const id = filterKey(r.categoryId);
        const on = !hidden.includes(id);
        const category = r.categoryId ? categoryById.get(r.categoryId) : undefined;
        const color = category ? resolveCategoryColor(category, CategoryPalette) : Colors.dark.surface3;
        const name = r.categoryId === null ? 'Uncategorized' : (category?.name ?? 'Unknown');
        return (
          <Pressable
            key={id}
            accessibilityRole="checkbox"
            accessibilityLabel={name}
            accessibilityState={{ checked: on }}
            onPress={() => setHidden(toggleId(hidden, id))}
            style={styles.row}
          >
            {r.categoryId === null ? <View style={styles.dashedDot} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
            <View style={styles.name}>
              <ThemedText type="body" themeColor="text" numberOfLines={1}>
                {name}
              </ThemedText>
              <ThemedText type="caption" themeColor="text3">
                {`${formatMoney(r.amountMinor, { sign: 'none' })} · ${Math.round(shareOf(r.amountMinor, total) * 100)}%`}
              </ThemedText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Only ${name}`} onPress={() => only(id)} hitSlop={8}>
              <ThemedText type="caption" themeColor="text2">
                Only
              </ThemedText>
            </Pressable>
            <View style={[styles.tick, on ? styles.tickOn : null]}>{on ? <Icon name="check" size={14} color="primaryInk" /> : null}</View>
          </Pressable>
        );
      })}

      <ThemedText type="caption" themeColor="text3" style={styles.hint}>
        Spending and income categories are picked separately, on their own tab.
      </ThemedText>

      <View style={styles.footer}>
        <Button
          variant={hiddenTotal > 0 ? 'ghost' : 'disabled'}
          onPress={() => {
            setHiddenExpense([]);
            setHiddenIncome([]);
          }}
          style={styles.resetButton}
        >
          Reset
        </Button>
        <Button onPress={apply} style={styles.applyButton}>
          {hiddenTotal > 0 ? `Apply · ${hiddenTotal} hidden` : 'Apply'}
        </Button>
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: Spacing.three },
  title: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  pad: { paddingHorizontal: Spacing.three },
  head: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  empty: { paddingVertical: Spacing.three, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dashedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.dark.text3,
  },
  name: { flex: 1, gap: 1 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.dark.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  hint: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  resetButton: { flexBasis: 140, flexGrow: 0 },
  applyButton: { flex: 1 },
});
