/**
 * `PeriodControl` — SPEC-UI-UX.md §6.10 item 1, SPEC-implementation.md §30.12. F9. Month/Week
 * segmented + a `‹ period label ›` stepper; "next" is disabled once the current period is
 * reached (`stepPeriod`'s own no-op — checked here by comparing the would-be next period's
 * `startMs` against the current one, not duplicating that "is this the current period" logic).
 *
 * The left/right stepper glyphs reuse the one `chevron-right` icon this app has (there's no
 * `chevron-left` in the set) — the left one is the same glyph rotated 180°, not a different icon.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { stepPeriod, type Period } from '@/domain/period';

import { Icon } from '@/ui/icon';
import { SegmentedControl } from '@/ui/segmented-control';
import { ThemedText } from '@/ui/themed-text';

const MODE_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
] as const;

export type PeriodControlProps = {
  period: Period;
  onModeChange: (mode: Period['mode']) => void;
  onStep: (dir: -1 | 1) => void;
};

export function PeriodControl({ period, onModeChange, onStep }: PeriodControlProps) {
  const nextDisabled = stepPeriod(period, 1).startMs === period.startMs;

  return (
    <View style={styles.wrap}>
      <SegmentedControl options={MODE_OPTIONS} value={period.mode} onChange={onModeChange} />
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => onStep(-1)} hitSlop={8}>
          <View style={styles.flipped}>
            <Icon name="chevron-right" size={16} color="text2" />
          </View>
        </Pressable>
        <ThemedText type="label" themeColor="text" style={styles.label}>
          {period.label}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next period"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          onPress={() => onStep(1)}
          hitSlop={8}
        >
          <Icon name="chevron-right" size={16} color={nextDisabled ? 'text3' : 'text2'} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  flipped: { transform: [{ rotate: '180deg' }] },
  label: { minWidth: 120, textAlign: 'center' },
});
