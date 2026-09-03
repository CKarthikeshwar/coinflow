/**
 * `BalanceArcCard` — SPEC-UI-UX.md §6.10 item 2, SPEC-implementation.md §26.1/§29.4. F9. The
 * "This month" card: a greyscale half-ring arc (fill = share of income remaining) with Balance +
 * a "N% of income left" caption in its hollow, then Income/Spent rows below. The first real use
 * of `d3-shape`'s `arc()` generator in this codebase (installed since Phase 1, unused until now)
 * — it returns an SVG path `d` string directly when given no rendering context, which
 * `react-native-svg`'s `<Path>` consumes as-is.
 *
 * The arc spans -90°..+90° through 0° (d3's angle convention: 0 = 12 o'clock, clockwise
 * positive) — a dome over the top half, not the bottom — so the hollow text sits naturally
 * beneath the curve rather than above it.
 */

import { arc } from 'd3-shape';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/format/money';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';

const SIZE = 220;
const STROKE = 20;
const R_OUTER = SIZE / 2 - 6;
const R_INNER = R_OUTER - STROKE;
const START_ANGLE = -Math.PI / 2;

const arcGenerator = arc().cornerRadius(STROKE / 2);

export type BalanceArcCardProps = { incomeMinor: number; spentMinor: number };

export function BalanceArcCard({ incomeMinor, spentMinor }: BalanceArcCardProps) {
  const balanceMinor = incomeMinor - spentMinor;
  const fill = incomeMinor > 0 ? Math.max(0, Math.min(1, balanceMinor / incomeMinor)) : 0;

  const trackD = arcGenerator({
    innerRadius: R_INNER,
    outerRadius: R_OUTER,
    startAngle: START_ANGLE,
    endAngle: -START_ANGLE,
  });
  const fillD =
    fill > 0
      ? arcGenerator({
          innerRadius: R_INNER,
          outerRadius: R_OUTER,
          startAngle: START_ANGLE,
          endAngle: START_ANGLE + fill * Math.PI,
        })
      : null;

  return (
    <Card style={styles.card}>
      <ThemedText type="label" themeColor="text3" style={styles.title}>
        This month
      </ThemedText>
      <View style={styles.arcWrap}>
        <Svg width={SIZE} height={R_OUTER + STROKE} viewBox={`${-SIZE / 2} ${-R_OUTER - 4} ${SIZE} ${R_OUTER + 8}`}>
          {trackD ? <Path d={trackD} fill={Colors.dark.surface3} /> : null}
          {fillD ? <Path d={fillD} fill={Colors.dark.text} /> : null}
        </Svg>
        <View style={styles.hollow} pointerEvents="none">
          <ThemedText type="title" style={styles.balance}>
            {formatMoney(balanceMinor, { sign: 'negativeOnly' })}
          </ThemedText>
          <ThemedText type="caption" themeColor="text3">
            {Math.round(fill * 100)}% of income left
          </ThemedText>
        </View>
      </View>
      <View style={styles.incomeSpentRow}>
        <View style={styles.incomeSpentItem}>
          <ThemedText type="label" themeColor="text3">
            Income
          </ThemedText>
          <ThemedText type="body" themeColor="text">
            {formatMoney(incomeMinor, { sign: 'always' })}
          </ThemedText>
        </View>
        <View style={styles.incomeSpentItem}>
          <ThemedText type="label" themeColor="text3">
            Spent
          </ThemedText>
          <ThemedText type="body" themeColor="text">
            {formatMoney(-spentMinor, { sign: 'always' })}
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center' },
  title: { alignSelf: 'flex-start' },
  arcWrap: { marginTop: Spacing.two, alignItems: 'center', justifyContent: 'flex-end' },
  hollow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.half,
  },
  balance: {},
  incomeSpentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  incomeSpentItem: { gap: Spacing.half },
});
