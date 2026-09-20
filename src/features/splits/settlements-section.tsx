/**
 * FILE PURPOSE
 * ------------
 * The **Settlements** section on Transaction Details (SPEC-UI-UX.md §6.8, UI-074): what this payment settled —
 * `₹450 · Rahul’s share · Dinner` — with the unallocated remainder underneath and a **Remove** on each line
 * (the Undo snackbar only lasts a few seconds; this is the way back afterwards). Pure presentation.
 */

import { StyleSheet, Pressable, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { SettlementLine } from '@/db/repositories/settlements';
import { formatRupees } from '@/domain/format/money';

import { ThemedText } from '@/ui/themed-text';

export type SettlementsSectionProps = {
  lines: readonly SettlementLine[];
  /** What is left of the payment after these settlements. */
  unallocatedMinor: number;
  onRemove: (settlementId: string) => void;
};

export function SettlementsSection({ lines, unallocatedMinor, onRemove }: SettlementsSectionProps) {
  if (lines.length === 0) return null;
  return (
    <View style={styles.card}>
      <ThemedText type="label" themeColor="text" style={styles.title}>
        Settlements
      </ThemedText>
      {lines.map((l) => (
        <View key={l.id} style={styles.row}>
          <View style={styles.text}>
            <ThemedText type="body" themeColor="text">
              {l.kind === 'share' ? `${l.counterpartName}’s share` : `${l.counterpartName}’s request`}
            </ThemedText>
            {l.label ? (
              <ThemedText type="caption" themeColor="text3">
                {l.label}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText type="body" themeColor="text">
            {formatRupees(l.amountMinor)}
          </ThemedText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove settlement with ${l.counterpartName}`} onPress={() => onRemove(l.id)} style={styles.remove}>
            <ThemedText type="label" themeColor="text3">
              Remove
            </ThemedText>
          </Pressable>
        </View>
      ))}
      {unallocatedMinor > 0 ? (
        <ThemedText type="caption" themeColor="text3" style={styles.rest}>
          {formatRupees(unallocatedMinor)} of this payment isn’t assigned to anything.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
    overflow: 'hidden',
  },
  title: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  text: { flex: 1 },
  remove: { minHeight: 44, justifyContent: 'center', paddingLeft: Spacing.one },
  rest: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
