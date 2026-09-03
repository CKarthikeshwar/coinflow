/**
 * `MeanMedianTile` — SPEC-UI-UX.md §6.10 item 3 (CR-1), SPEC-implementation.md §26.6/§29.4. F9.
 *
 * Not a literal reuse of `StatTile` despite its own header comment suggesting one — `StatTile`'s
 * comparison line is a signed **percentage** (`formatPercentDelta`), but this tile needs the
 * previous period's **absolute amount** ("Last month ₹1,410" / "Last week ₹1,410", CR-1's exact
 * wording) — a different data shape, not a delta. Same shell (label + big value + a quiet
 * comparison line), built as its own small component instead of stretching `StatTile`'s prop
 * surface to cover both cases.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/format/money';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';

export type MeanMedianTileProps = {
  label: string;
  valueMinor: number;
  /** `null` when the previous period has no expense data at all (IMP-032) — hides the line. */
  previousValueMinor: number | null;
  /** "Last month" or "Last week", tracking the period control's mode (CR-1). */
  previousLabel: string;
};

export function MeanMedianTile({ label, valueMinor, previousValueMinor, previousLabel }: MeanMedianTileProps) {
  return (
    <Card style={styles.tile} padding={Spacing.three}>
      <ThemedText type="label" themeColor="text2">
        {label}
      </ThemedText>
      <ThemedText type="title" style={styles.value}>
        {formatMoney(valueMinor, { sign: 'none' })}
      </ThemedText>
      <View style={styles.comparisonRow}>
        <ThemedText type="caption" themeColor="text3">
          {previousValueMinor == null ? 'No prior data' : `${previousLabel} ${formatMoney(previousValueMinor, { sign: 'none' })}`}
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: Spacing.half },
  value: { marginTop: Spacing.half },
  comparisonRow: { marginTop: Spacing.half },
});
