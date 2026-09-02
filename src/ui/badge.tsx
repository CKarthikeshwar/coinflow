/**
 * `Badge` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Pill, `surface3`/`text2`,
 * tabular count via `formatCount` (§27.1).
 */

import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatCount } from '@/domain/format/money';

import { ThemedText } from './themed-text';

export type BadgeProps = { count: number };

export function Badge({ count }: BadgeProps) {
  return (
    <View style={styles.pill}>
      <ThemedText type="caption" themeColor="text2">
        {formatCount(count)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
