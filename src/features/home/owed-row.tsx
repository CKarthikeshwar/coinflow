/**
 * `OwedToYouRow` — Home's compact "Owed to you ₹N" row (SPEC-UI-UX.md §6.2 V2 / UI-081), under the month card;
 * tap → the Splits page. Renders nothing when nothing is outstanding.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { formatRupees } from '@/domain/format/money';

import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export function OwedToYouRow({ amountMinor, onPress }: { amountMinor: number; onPress: () => void }) {
  if (amountMinor <= 0) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Owed to you ${formatRupees(amountMinor)}`} onPress={onPress} style={styles.row}>
      <View style={styles.marker} />
      <ThemedText type="body" themeColor="text" style={styles.label}>
        Owed to you
      </ThemedText>
      <ThemedText type="body" themeColor="text">
        {formatRupees(amountMinor)}
      </ThemedText>
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
  marker: { width: 8, height: 8, borderRadius: 2, backgroundColor: Colors.dark.text3 },
  label: { flex: 1 },
});
