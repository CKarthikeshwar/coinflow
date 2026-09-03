/**
 * `StepDots` — SPEC-UI-UX.md §6.1 ("3-dot step progress"). F12.
 */

import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

export type StepDotsProps = { total: number; current: number };

export function StepDots({ total, current }: StepDotsProps) {
  return (
    <View
      testID="step-dots"
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <View key={n} testID={`step-dot-${n}`} style={[styles.dot, n === current ? styles.dotActive : null]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.one },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface3,
  },
  dotActive: { backgroundColor: Colors.dark.text, width: 18 },
});
