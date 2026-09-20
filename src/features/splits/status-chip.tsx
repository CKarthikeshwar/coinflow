/**
 * A small status pill for a share / request row — *Pending*, *Partly paid ₹100*, *Settled* — in the app's
 * black-and-white language (SPEC-UI-UX.md §2 / §6.19): settled is filled, partial is outlined solid, pending is
 * a hairline outline.
 */

import { StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatRupees } from '@/domain/format/money';

import { ThemedText } from '@/ui/themed-text';

export type ChipStatus = { amountMinor: number; settledMinor: number };

/** `Pending` · `Partly paid ₹100` · `Settled`. */
export function statusLabel({ amountMinor, settledMinor }: ChipStatus): string {
  if (settledMinor >= amountMinor) return 'Settled';
  return settledMinor > 0 ? `Partly paid ${formatRupees(settledMinor)}` : 'Pending';
}

export function StatusChip({ status }: { status: ChipStatus }) {
  const settled = status.settledMinor >= status.amountMinor;
  const partial = !settled && status.settledMinor > 0;
  return (
    <View style={[styles.chip, settled ? styles.settled : partial ? styles.partial : styles.pending]}>
      <ThemedText type="caption" themeColor={settled ? 'primaryInk' : partial ? 'text' : 'text2'}>
        {statusLabel(status)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 2, borderWidth: 1, borderColor: 'transparent' },
  settled: { backgroundColor: Colors.dark.primary },
  partial: { borderColor: Colors.dark.text },
  pending: { borderColor: Colors.dark.hairline },
});
