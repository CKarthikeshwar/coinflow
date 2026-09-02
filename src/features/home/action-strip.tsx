/**
 * `ActionStripRow` — SPEC-UI-UX.md §3.6 / §6.2, SPEC-implementation.md §29.4. A Home row for
 * "N to review" / "N uncategorized"; fill-dot (review) vs ring marker (uncategorized), count
 * badge, chevron. Renders only when `count > 0`.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

import { Badge } from '@/ui/badge';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export type ActionStripRowProps = {
  kind: 'review' | 'uncat';
  count: number;
  onPress: () => void;
};

const LABEL: Record<ActionStripRowProps['kind'], (n: number) => string> = {
  review: (n) => `${n} to review`,
  uncat: (n) => `${n} uncategorized`,
};

export function ActionStripRow({ kind, count, onPress }: ActionStripRowProps) {
  if (count <= 0) return null;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={[styles.marker, kind === 'review' ? styles.markerFill : styles.markerRing]} />
      <ThemedText type="body" themeColor="text" style={styles.label}>
        {LABEL[kind](count)}
      </ThemedText>
      <Badge count={count} />
      <Icon name="chevron-right" size={16} color="text3" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  marker: { width: 8, height: 8, borderRadius: 4 },
  markerFill: { backgroundColor: Colors.dark.text },
  markerRing: { borderWidth: 1.5, borderColor: Colors.dark.text3 },
  label: { flex: 1 },
});
