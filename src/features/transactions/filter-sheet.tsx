/**
 * `FilterSheet` — SPEC-UI-UX.md §6.9, SPEC-implementation.md §29.4. Category (multi-select) ·
 * Type (segmented All/Expense/Income) · Payment method (multi-select) · Date range (preset chips
 * + Custom). Apply writes the selection into the Transactions route's own params via
 * `router.setParams` — `filter-draft.ts`'s header comment already calls out that "the *applied*
 * filter lives in Transactions route params, not here"; this sheet only owns the in-progress
 * selection while it's open. Opened with the *currently applied* filter as its `params` (see
 * `transactions.tsx`), same seed-from-params pattern `transaction-sheet.tsx` uses for Edit.
 *
 * Date range "Custom" uses two plain `YYYY-MM-DD` text fields, not a calendar picker — no
 * calendar/date-picker component exists yet in this codebase, and no native date-picker package
 * is installed (adding one is a real, separate decision: a new native module needs a dev-client
 * rebuild). Same outcome (an arbitrary custom range, including the spec'd start-after-end inline
 * error on Apply), simpler mechanism — documented in `SPEC/traceability.md`.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { format, parse, startOfMonth, subDays, subMonths } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCategories } from '@/db/repositories/categories';
import type { PaymentMethod, TransactionType } from '@/db/schema';
import { useFilterDraft, useSheetRegistry } from '@/stores';

import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { SegmentedControl } from '@/ui/segmented-control';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
];

const TYPE_OPTIONS: { value: 'all' | TransactionType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

const DATE_FMT = 'yyyy-MM-dd';

function presetRange(preset: 'month' | '30d' | '3m'): { from: number; to: null } {
  const now = new Date();
  if (preset === 'month') return { from: startOfMonth(now).getTime(), to: null };
  if (preset === '30d') return { from: subDays(now, 30).getTime(), to: null };
  return { from: subMonths(now, 3).getTime(), to: null };
}

export function FilterSheet() {
  const params = useSheetRegistry((s) => s.params) as {
    categoryIds?: string[];
    type?: TransactionType;
    methods?: PaymentMethod[];
    from?: number;
    to?: number;
  };
  const close = useSheetRegistry((s) => s.close);
  const draft = useFilterDraft();
  const { data: categories } = useCategories();

  const [showCustom, setShowCustom] = useState(params.from != null || params.to != null);
  const [startText, setStartText] = useState(params.from ? format(params.from, DATE_FMT) : '');
  const [endText, setEndText] = useState(params.to ? format(params.to, DATE_FMT) : '');
  const [rangeError, setRangeError] = useState<string | null>(null);

  // `FilterSheet` mounts fresh each time the sheet opens (SheetHost only renders it while
  // `current === 'filter'`), so a mount-only effect is exactly "seed once per open" —
  // `transactions.tsx` passes the currently-applied filter as this sheet's `params`.
  useEffect(() => {
    useFilterDraft.getState().seed({
      categoryIds: params.categoryIds ?? [],
      type: params.type ?? null,
      methods: params.methods ?? [],
      from: params.from ?? null,
      to: params.to ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFilters =
    draft.categoryIds.length > 0 || draft.type !== null || draft.methods.length > 0 || draft.from != null || draft.to != null;

  const toggleCategory = (id: string) => {
    const next = draft.categoryIds.includes(id)
      ? draft.categoryIds.filter((c) => c !== id)
      : [...draft.categoryIds, id];
    draft.set({ categoryIds: next });
  };

  const toggleMethod = (m: PaymentMethod) => {
    const next = draft.methods.includes(m) ? draft.methods.filter((x) => x !== m) : [...draft.methods, m];
    draft.set({ methods: next });
  };

  const pickPreset = (preset: 'month' | '30d' | '3m') => {
    setShowCustom(false);
    setRangeError(null);
    draft.set(presetRange(preset));
  };

  const pickCustom = () => setShowCustom(true);

  const handleReset = () => {
    setShowCustom(false);
    setStartText('');
    setEndText('');
    setRangeError(null);
    draft.reset();
  };

  const handleApply = () => {
    let from = draft.from;
    let to = draft.to;

    if (showCustom) {
      const start = startText.trim() ? parse(startText.trim(), DATE_FMT, new Date()) : null;
      const end = endText.trim() ? parse(endText.trim(), DATE_FMT, new Date()) : null;
      if (start && Number.isNaN(start.getTime())) return setRangeError('Start date is invalid.');
      if (end && Number.isNaN(end.getTime())) return setRangeError('End date is invalid.');
      if (start && end && start.getTime() > end.getTime()) {
        return setRangeError('Start date is after end date.');
      }
      from = start ? start.getTime() : null;
      to = end ? end.getTime() : null;
    }
    setRangeError(null);

    router.setParams({
      categoryIds: draft.categoryIds.join(','),
      type: draft.type ?? '',
      methods: draft.methods.join(','),
      from: from != null ? String(from) : '',
      to: to != null ? String(to) : '',
    });
    close();
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.root}>
      <ThemedText type="title" style={styles.title}>
        Filter
      </ThemedText>

      <View style={styles.section}>
        <ThemedText type="label" themeColor="text3">
          Category
        </ThemedText>
        <View style={styles.chipRow}>
          {(categories ?? [])
            .filter((c) => c.key !== 'uncategorized')
            .map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={draft.categoryIds.includes(c.id)}
                onPress={() => toggleCategory(c.id)}
              />
            ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="label" themeColor="text3">
          Type
        </ThemedText>
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={draft.type ?? 'all'}
          onChange={(v) => draft.set({ type: v === 'all' ? null : v })}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="label" themeColor="text3">
          Payment method
        </ThemedText>
        <View style={styles.chipRow}>
          {METHOD_OPTIONS.map((m) => (
            <Chip
              key={m.value}
              label={m.label}
              selected={draft.methods.includes(m.value)}
              onPress={() => toggleMethod(m.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="label" themeColor="text3">
          Date range
        </ThemedText>
        <View style={styles.chipRow}>
          <Chip label="This month" onPress={() => pickPreset('month')} />
          <Chip label="Last 30 days" onPress={() => pickPreset('30d')} />
          <Chip label="Last 3 months" onPress={() => pickPreset('3m')} />
          <Chip label="Custom" selected={showCustom} onPress={pickCustom} />
        </View>
        {showCustom ? (
          <View style={styles.customRow}>
            <TextField value={startText} onChangeText={setStartText} placeholder="Start (yyyy-mm-dd)" />
            <TextField value={endText} onChangeText={setEndText} placeholder="End (yyyy-mm-dd)" />
          </View>
        ) : null}
        {rangeError ? (
          <ThemedText type="caption" themeColor="text" style={styles.error}>
            {rangeError}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button variant={hasFilters ? 'ghost' : 'disabled'} onPress={handleReset} style={styles.resetButton}>
          Reset
        </Button>
        <Button onPress={handleApply} style={styles.applyButton}>
          Apply
        </Button>
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: Spacing.three },
  title: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  section: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  customRow: { flexDirection: 'row', gap: Spacing.two },
  error: { paddingTop: Spacing.one },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
  },
  resetButton: { flexBasis: 100, flexGrow: 0 },
  applyButton: { flex: 1 },
});
