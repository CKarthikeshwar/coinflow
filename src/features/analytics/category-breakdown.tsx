/**
 * `CategoryBreakdown` — SPEC-UI-UX.md §6.10 (CR-27), SPEC-implementation.md §26.4/§29.4/CR-40. One "Breakdown"
 * card for both sides of the ledger: a **Spent / Income** switch, a colour donut with the shown total in its
 * centre, and the ranked category list. Every row has an **eye** that hides or shows that category; a hidden row
 * stays in the list (dimmed, struck through) so it is one tap to bring back, and it leaves the donut, the
 * percentages and the centre total. This card is the only coloured surface in the app (V-11).
 *
 * Uses `d3-shape`'s `pie()` + `arc()` together — `pie()` turns the shown amounts into angles, `arc()` turns each
 * into an SVG path `d`.
 *
 * Uncategorized (`categoryId: null`) is its own row — a dashed-outline swatch (V-4) and a "Fix N" label instead of
 * a %/₹ pair, tapping through to the same filtered Transactions view. It is not drawn in the donut (the dashed
 * treatment is the point), but it counts in the shown total and can be hidden like any other row.
 */

import { arc, pie } from 'd3-shape';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { CategoryPalette, Colors, Radius, Spacing } from '@/constants/theme';
import type { Category } from '@/db/schema';
import { type CategoryKind, filterKey, NO_ACCOUNT_ID } from '@/domain/analytics-filter';
import { resolveCategoryColor, shareOf } from '@/domain/analytics';
import { formatMoney } from '@/domain/format/money';
import type { Period } from '@/domain/period';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import { SegmentedControl } from '@/ui/segmented-control';
import { ThemedText } from '@/ui/themed-text';

export type BreakdownRow = { categoryId: string | null; amountMinor: number; n: number };

const DONUT_SIZE = 160;
const DONUT_STROKE = 24;
const R_OUTER = DONUT_SIZE / 2;
const R_INNER = R_OUTER - DONUT_STROKE;

const KIND_OPTIONS = [
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Income' },
] as const;

const pieGenerator = pie<BreakdownRow>()
  .value((r) => r.amountMinor)
  .sort(null);
const arcGenerator = arc();

export type CategoryBreakdownProps = {
  rows: BreakdownRow[];
  categoryById: Map<string, Category>;
  period: Period;
  /** Which side is showing. Defaults to spending. */
  kind?: CategoryKind;
  /** When given, the card shows the Spent / Income switch. */
  onKindChange?: (kind: CategoryKind) => void;
  /** Hidden category ids for this `kind` (`'uncategorized'` for the Uncategorized row). */
  hiddenIds?: string[];
  onToggleHidden?: (id: string) => void;
  onShowAll?: () => void;
  /** The account filter, carried into the Transactions link. */
  accountIds?: string[];
};

export function CategoryBreakdown({
  rows,
  categoryById,
  period,
  kind = 'expense',
  onKindChange,
  hiddenIds = [],
  onToggleHidden,
  onShowAll,
  accountIds = [],
}: CategoryBreakdownProps) {
  const isHidden = (row: BreakdownRow) => hiddenIds.includes(filterKey(row.categoryId));
  const nameOf = (row: BreakdownRow) =>
    row.categoryId === null ? 'Uncategorized' : (categoryById.get(row.categoryId)?.name ?? 'Unknown');
  const colorOf = (row: BreakdownRow) => {
    const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
    return category ? resolveCategoryColor(category, CategoryPalette) : Colors.dark.surface3;
  };

  const header = (
    <>
      <View style={styles.titleRow}>
        <ThemedText type="label" themeColor="text3">
          Breakdown
        </ThemedText>
        {rows.length > 0 && onToggleHidden ? (
          <ThemedText type="caption" themeColor="text3">
            Tap the eye to hide one
          </ThemedText>
        ) : null}
      </View>
      {onKindChange ? <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={onKindChange} /> : null}
    </>
  );

  if (rows.length === 0) {
    return (
      <Card style={styles.card}>
        {header}
        <ThemedText type="body" themeColor="text3" style={styles.empty}>
          Nothing recorded for this period.
        </ThemedText>
      </Card>
    );
  }

  const shown = rows.filter((r) => !isHidden(r));
  const hidden = rows.filter(isHidden);
  const shownTotal = shown.reduce((sum, r) => sum + r.amountMinor, 0);
  const slices = pieGenerator(shown.filter((r) => r.categoryId !== null));

  const openRow = (row: BreakdownRow) => {
    const range = `from=${period.startMs}&to=${period.endMsExclusive}`;
    const realAccounts = accountIds.filter((id) => id !== NO_ACCOUNT_ID);
    const accounts = realAccounts.length > 0 ? `&accountIds=${realAccounts.join(',')}` : '';
    const type = kind === 'income' ? 'income' : 'expense';
    const href =
      row.categoryId === null
        ? `/transactions?uncategorized=1&type=${type}&${range}${accounts}`
        : `/transactions?categoryIds=${row.categoryId}&${range}${accounts}`;
    router.push(href as never);
  };

  return (
    <Card style={styles.card}>
      {header}

      {shown.length === 0 ? (
        <View style={styles.allHidden}>
          <ThemedText type="body" themeColor="text3">
            Everything is hidden.
          </ThemedText>
          {onShowAll ? <Button variant="ghost" onPress={onShowAll}>Show all</Button> : null}
        </View>
      ) : (
        <View style={styles.donutWrap}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`${-R_OUTER} ${-R_OUTER} ${DONUT_SIZE} ${DONUT_SIZE}`}>
            {slices.map((slice) => {
              const d = arcGenerator({
                innerRadius: R_INNER,
                outerRadius: R_OUTER,
                startAngle: slice.startAngle,
                endAngle: slice.endAngle,
              });
              return d ? <Path key={slice.data.categoryId ?? 'uncat'} d={d} fill={colorOf(slice.data)} /> : null;
            })}
          </Svg>
          <View style={styles.donutCenter} pointerEvents="none">
            <ThemedText type="label" themeColor="text" accessibilityLabel="Shown total">
              {formatMoney(shownTotal, { sign: 'none' })}
            </ThemedText>
            <ThemedText type="caption" themeColor="text3">
              {hidden.length > 0 ? `${shown.length} shown` : kind === 'income' ? 'earned' : 'spent'}
            </ThemedText>
          </View>
        </View>
      )}

      {hidden.length > 0 && shown.length > 0 ? (
        <View style={styles.hiddenLine}>
          <ThemedText type="caption" themeColor="text3" style={styles.hiddenText}>
            {`Hidden: ${hidden.map(nameOf).join(', ')}`}
          </ThemedText>
          {onShowAll ? (
            <Pressable accessibilityRole="button" onPress={onShowAll} hitSlop={8}>
              <ThemedText type="caption" themeColor="text">
                Show all
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.list}>
        {rows.map((row) => {
          const isUncategorized = row.categoryId === null;
          const rowHidden = isHidden(row);
          const color = colorOf(row);
          const share = rowHidden ? 0 : shareOf(row.amountMinor, shownTotal);
          const label = nameOf(row);

          return (
            <View key={row.categoryId ?? 'uncategorized'} style={[styles.row, rowHidden ? styles.rowHidden : null]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isUncategorized ? `Fix ${row.n} uncategorized` : label}
                onPress={() => openRow(row)}
                style={styles.rowMain}
              >
                <View style={styles.rowTop}>
                  {isUncategorized || rowHidden ? (
                    <View style={styles.dashedDot} />
                  ) : (
                    <View style={[styles.dot, { backgroundColor: color }]} />
                  )}
                  <ThemedText
                    type="body"
                    themeColor="text"
                    numberOfLines={1}
                    style={[
                      styles.rowLabel,
                      isUncategorized ? styles.uncategorizedLabel : null,
                      rowHidden ? styles.struck : null,
                    ]}
                  >
                    {label}
                  </ThemedText>
                  {rowHidden ? (
                    <>
                      <ThemedText type="caption" themeColor="text3">
                        hidden
                      </ThemedText>
                      <ThemedText type="body" themeColor="text" style={styles.struck}>
                        {formatMoney(row.amountMinor, { sign: 'none' })}
                      </ThemedText>
                    </>
                  ) : isUncategorized ? (
                    <ThemedText type="label" themeColor="text2">
                      Fix {row.n}
                    </ThemedText>
                  ) : (
                    <>
                      <ThemedText type="caption" themeColor="text3">
                        {Math.round(share * 100)}%
                      </ThemedText>
                      <ThemedText type="body" themeColor="text">
                        {formatMoney(row.amountMinor, { sign: 'none' })}
                      </ThemedText>
                    </>
                  )}
                </View>
                <View style={styles.barTrack}>
                  {!isUncategorized && !rowHidden ? (
                    <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: color }]} />
                  ) : null}
                </View>
              </Pressable>
              {onToggleHidden ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${rowHidden ? 'Show' : 'Hide'} ${label}`}
                  onPress={() => onToggleHidden(filterKey(row.categoryId))}
                  hitSlop={6}
                  style={styles.eye}
                >
                  <Icon name={rowHidden ? 'eye-off' : 'eye'} size={16} color="text2" />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  empty: { paddingVertical: Spacing.three, textAlign: 'center' },
  allHidden: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  donutWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.two },
  donutCenter: { position: 'absolute', alignItems: 'center', gap: 2 },
  hiddenLine: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  hiddenText: { flexShrink: 1 },
  list: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowHidden: { opacity: 0.5 },
  rowMain: { flex: 1, gap: Spacing.one },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dashedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.dark.text3,
  },
  rowLabel: { flex: 1 },
  uncategorizedLabel: { textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
  struck: { textDecorationLine: 'line-through' },
  eye: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barTrack: { height: 4, borderRadius: Radius.pill, backgroundColor: Colors.dark.surface3, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: Radius.pill },
});
