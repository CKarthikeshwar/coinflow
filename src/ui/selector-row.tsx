/**
 * `SelectorRow` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. icon + label + value +
 * chevron → opens a picker. Used for category / payment method / date rows in sheets.
 */

import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export type SelectorRowProps = {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
};

export function SelectorRow({ icon, label, value, onPress }: SelectorRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Icon name={icon} size={18} color="text3" />
      <ThemedText type="body" themeColor="text" style={styles.label}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText type="body" themeColor="text3">
          {value}
        </ThemedText>
      ) : null}
      <Icon name="chevron-right" size={16} color="text3" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  label: { flex: 1 },
});
