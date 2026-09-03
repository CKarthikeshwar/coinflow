/**
 * `Skeleton` — SPEC-UI-UX.md §3.6 / V-3. Neutral `surface3` blocks matching the target
 * layout, no spinner. `'suggestion-list'` (§30.5) and `'transaction-list'` (§30.9) both
 * render 4 card-shaped blocks — same shape, different screens. `'home'` (§30.4) is hero
 * block + 2 tiles + 3 card rows. `'analytics'` (§30.12, F9) is the arc card + 2 tiles +
 * a chart-height block (covers both the donut and the daily chart's placeholder) + 3 rows.
 */

import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

export type SkeletonLayout = 'suggestion-list' | 'transaction-list' | 'home' | 'analytics';

export type SkeletonProps = { layout: SkeletonLayout };

export function Skeleton({ layout }: SkeletonProps) {
  if (layout === 'suggestion-list' || layout === 'transaction-list') {
    return (
      <View style={styles.list}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.card} />
        ))}
      </View>
    );
  }
  if (layout === 'home') {
    return (
      <View style={styles.list}>
        <View style={styles.heroBlock} />
        <View style={styles.tileRow}>
          <View style={styles.tileBlock} />
          <View style={styles.tileBlock} />
        </View>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.card} />
        ))}
      </View>
    );
  }
  if (layout === 'analytics') {
    return (
      <View style={styles.list}>
        <View style={styles.arcBlock} />
        <View style={styles.tileRow}>
          <View style={styles.tileBlock} />
          <View style={styles.tileBlock} />
        </View>
        <View style={styles.chartBlock} />
        <View style={styles.chartBlock} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.card} />
        ))}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  card: {
    height: 76,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface3,
  },
  heroBlock: {
    height: 140,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface3,
  },
  tileRow: { flexDirection: 'row', gap: Spacing.two },
  tileBlock: {
    flex: 1,
    height: 88,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface3,
  },
  arcBlock: {
    height: 180,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface3,
  },
  chartBlock: {
    height: 160,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface3,
  },
});
