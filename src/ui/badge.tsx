/**
 * A small pill showing a count (e.g. how many pending suggestions on the Review Queue tab).
 * Formats the number through `formatCount` (`src/domain/format/money.ts`), which caps display
 * at "99+" rather than letting a badge grow unbounded for a large count.
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
