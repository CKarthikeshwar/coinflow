/**
 * `IncomeVsSpending` — SPEC-UI-UX.md §6.10 (CR-27). Six calendar months of paired bars, income (white) beside spending
 * (grey), oldest first, the shown month last. A month with nothing in it is drawn as a short stub rather than a gap.
 * Month mode only — the screen leaves the card out in Week mode — and left out when all six months are empty.
 */

import { format } from 'date-fns';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { MonthlyPoint } from '@/domain/analytics';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';

const WIDTH = 320;
const CHART_H = 100;
const LABEL_H = 16;
const BAR_W = 16;
const STUB = 3;
const SPENT_FILL = '#4a4c58';

export type IncomeVsSpendingProps = { series: MonthlyPoint[] };

export function IncomeVsSpending({ series }: IncomeVsSpendingProps) {
  const max = Math.max(...series.flatMap((p) => [p.spentMinor, p.incomeMinor]), 0);
  if (series.length === 0 || max === 0) return null;

  const slot = WIDTH / series.length;
  const heightOf = (v: number) => (v <= 0 ? STUB : Math.max(STUB, (CHART_H * v) / max));

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="label" themeColor="text3">
          Income vs spending
        </ThemedText>
        <ThemedText type="caption" themeColor="text3">
          {`${series.length} months`}
        </ThemedText>
      </View>
      <Svg width="100%" height={CHART_H + LABEL_H} viewBox={`0 0 ${WIDTH} ${CHART_H + LABEL_H}`}>
        {series.map((p, i) => {
          const x = i * slot + (slot - (BAR_W * 2 + 2)) / 2;
          const hi = heightOf(p.incomeMinor);
          const hs = heightOf(p.spentMinor);
          return (
            <G key={p.monthStartMs}>
              <Rect x={x} y={CHART_H - hi} width={BAR_W} height={hi} rx={4} fill={Colors.dark.text} />
              <Rect x={x + BAR_W + 2} y={CHART_H - hs} width={BAR_W} height={hs} rx={4} fill={SPENT_FILL} />
              <SvgText
                testID={`month-label-${i}`}
                x={x + BAR_W + 1}
                y={CHART_H + 12}
                fontSize={9}
                fill={Colors.dark.text3}
                textAnchor="middle"
              >
                {format(p.monthStartMs, 'MMM')}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.pill}>
          <View style={[styles.swatch, { backgroundColor: Colors.dark.text }]} />
          <ThemedText type="caption" themeColor="text2">
            Income
          </ThemedText>
        </View>
        <View style={styles.pill}>
          <View style={[styles.swatch, { backgroundColor: SPENT_FILL }]} />
          <ThemedText type="caption" themeColor="text2">
            Spent
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  legend: { flexDirection: 'row', gap: Spacing.two },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface3,
  },
  swatch: { width: 8, height: 8, borderRadius: 3 },
});
