/**
 * `Chip` — SPEC-UI-UX.md §3.6/§6.7/§6.9, SPEC-implementation.md §29.4. Two uses, one component:
 * a toggleable multi-select chip (Filter sheet's Category/Payment method rows — `selected` +
 * `onPress`, no `onRemove`) and a removable applied-filter chip (Transactions' filter-chip row —
 * `onRemove` renders the trailing ×, `onPress` optional).
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
};

export function Chip({ label, selected = false, onPress, onRemove }: ChipProps) {
  return (
    <View style={[styles.chip, selected ? styles.chipSelected : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        disabled={!onPress}
        hitSlop={4}
      >
        <ThemedText type="label" themeColor={selected ? 'primaryInk' : 'text'}>
          {label}
        </ThemedText>
      </Pressable>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} hitSlop={8}>
          <Icon name="x" size={13} color={selected ? 'primaryInk' : 'text3'} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface3,
  },
  chipSelected: { backgroundColor: Colors.dark.primary },
});
