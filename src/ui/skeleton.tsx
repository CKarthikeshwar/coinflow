/**
 * `Skeleton` — SPEC-UI-UX.md §3.6 / V-3. Neutral `surface3` blocks matching the target
 * layout, no spinner. `'suggestion-list'` (§30.5) and `'transaction-list'` (§30.9) both
 * render 4 card-shaped blocks — same shape, different screens.
 */

import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

export type SkeletonLayout = 'suggestion-list' | 'transaction-list';

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
  return null;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  card: {
    height: 76,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface3,
  },
});
