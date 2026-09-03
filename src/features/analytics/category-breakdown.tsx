/**
 * `CategoryBreakdown` — SPEC-UI-UX.md §6.10 item 4, SPEC-implementation.md §26.4/§29.4. F9.
 * "Where it went" — the *only* coloured surface in the app (V-11): a ranked list (colour dot ·
 * name · % · ₹ · a thin colour bar) plus a colour donut. Uses `d3-shape`'s `pie()` + `arc()`
 * together — `pie()` turns the row amounts into angles, `arc()` turns each into an SVG path `d`.
 *
 * Uncategorized (`categoryId: null`) is its own list row — no filled dot (a dashed-outline
 * swatch instead, matching the dashed-underline treatment `TransactionCard` already uses for
 * Uncategorized, V-4) — and a "Fix N" trailing label instead of a %/₹ pair, tapping through to
 * the same filtered Transactions view. Simplification, not silent: it's excluded from the donut
 * itself rather than rendered as a hatched slice — an actual SVG hatch-pattern fill is real
 * extra complexity for the one deliberately-uncoloured exception, and the list row already
 * carries its own distinct (dashed, not coloured) treatment.
 */

import { arc, pie } from 'd3-shape';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { CategoryPalette, Colors, Radius, Spacing } from '@/constants/theme';
import type { Category } from '@/db/schema';
import { resolveCategoryColor, shareOf } from '@/domain/analytics';
import { formatMoney } from '@/domain/format/money';
import type { Period } from '@/domain/period';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';

export type BreakdownRow = { categoryId: string | null; amountMinor: number; n: number };

const DONUT_SIZE = 160;
const DONUT_STROKE = 24;
const R_OUTER = DONUT_SIZE / 2;
const R_INNER = R_OUTER - DONUT_STROKE;

const pieGenerator = pie<BreakdownRow>()
  .value((r) => r.amountMinor)
  .sort(null);
const arcGenerator = arc();

export type CategoryBreakdownProps = {
  rows: BreakdownRow[];
  categoryById: Map<string, Category>;
  period: Period;
};

export function CategoryBreakdown({ rows, categoryById, period }: CategoryBreakdownProps) {
  if (rows.length === 0) {
    return (
      <Card style={styles.card}>
        <ThemedText type="label" themeColor="text3">
          Where it went
        </ThemedText>
        <ThemedText type="body" themeColor="text3" style={styles.empty}>
          Nothing recorded for this period.
        </ThemedText>
      </Card>
    );
  }

  const spentMinor = rows.reduce((sum, r) => sum + r.amountMinor, 0);
  const donutRows = rows.filter((r) => r.categoryId !== null);
  const slices = pieGenerator(donutRows);

  const openRow = (row: BreakdownRow) => {
    const range = `from=${period.startMs}&to=${period.endMsExclusive}`;
    const href =
      row.categoryId === null ? `/transactions?uncategorized=1&${range}` : `/transactions?categoryIds=${row.categoryId}&${range}`;
    router.push(href as never);
  };

  return (
    <Card style={styles.card}>
      <ThemedText type="label" themeColor="text3">
        Where it went
      </ThemedText>

      <View style={styles.donutWrap}>
        <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`${-R_OUTER} ${-R_OUTER} ${DONUT_SIZE} ${DONUT_SIZE}`}>
          {slices.map((slice) => {
            const category = slice.data.categoryId ? categoryById.get(slice.data.categoryId) : undefined;
            const color = category ? resolveCategoryColor(category, CategoryPalette) : Colors.dark.surface3;
            const d = arcGenerator({
              innerRadius: R_INNER,
              outerRadius: R_OUTER,
              startAngle: slice.startAngle,
              endAngle: slice.endAngle,
            });
            return d ? <Path key={slice.data.categoryId ?? 'uncat'} d={d} fill={color} /> : null;
          })}
        </Svg>
      </View>

      <View style={styles.list}>
        {rows.map((row) => {
          const isUncategorized = row.categoryId === null;
          const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
          const color = category ? resolveCategoryColor(category, CategoryPalette) : Colors.dark.surface3;
          const share = shareOf(row.amountMinor, spentMinor);
          const label = isUncategorized ? 'Uncategorized' : (category?.name ?? 'Unknown');

          return (
            <Pressable
              key={row.categoryId ?? 'uncategorized'}
              accessibilityRole="button"
              accessibilityLabel={isUncategorized ? `Fix ${row.n} uncategorized` : label}
              onPress={() => openRow(row)}
              style={styles.row}
            >
              <View style={styles.rowTop}>
                {isUncategorized ? (
                  <View style={styles.dashedDot} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: color }]} />
                )}
                <ThemedText
                  type="body"
                  themeColor="text"
                  numberOfLines={1}
                  style={[styles.rowLabel, isUncategorized ? styles.uncategorizedLabel : null]}
                >
                  {label}
                </ThemedText>
                {isUncategorized ? (
                  <ThemedText type="label" themeColor="text2">
                    Fix {row.n}
                  </ThemedText>
                ) : (
                  <>
                    <ThemedText type="caption" themeColor="text3">
                      {Math.round(share * 100)}%
                    </ThemedText>
                    <ThemedText type="body" themeColor="text" style={styles.rowAmount}>
                      {formatMoney(row.amountMinor, { sign: 'none' })}
                    </ThemedText>
                  </>
                )}
              </View>
              <View style={styles.barTrack}>
                {!isUncategorized ? (
                  <View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: color }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  empty: { paddingVertical: Spacing.three, textAlign: 'center' },
  donutWrap: { alignItems: 'center', paddingVertical: Spacing.two },
  list: { gap: Spacing.three },
  row: { gap: Spacing.one },
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
  rowAmount: {},
  barTrack: { height: 4, borderRadius: Radius.pill, backgroundColor: Colors.dark.surface3, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: Radius.pill },
});
