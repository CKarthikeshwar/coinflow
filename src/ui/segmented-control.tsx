/**
 * `SegmentedControl` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. 2–3 options,
 * selected = `surface3` lift. Spec calls for the selected pill to slide (`fast`, §3.5); this
 * pass uses a static highlight instead of the reanimated slide — same end state, simpler,
 * noted as a deferred polish item.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

export type SegmentedControlOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <ThemedText type="label" themeColor={selected ? 'text' : 'text3'} style={styles.label}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.surface2,
    borderRadius: Radius.control,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: Radius.control - 3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  segmentSelected: { backgroundColor: Colors.dark.surface3 },
  label: { fontWeight: '600' },
});
