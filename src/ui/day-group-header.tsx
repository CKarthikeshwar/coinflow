/**
 * `DayGroupHeader` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Plain label (date +
 * optional subtotal) between card groups on the Transactions list — not a card (§6.7).
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatDayHeader } from '@/domain/format/when';
import { formatMoney } from '@/domain/format/money';

import { ThemedText } from './themed-text';

export type DayGroupHeaderProps = {
  dayStartMs: number;
  subtotalMinor?: number;
};

export function DayGroupHeader({ dayStartMs, subtotalMinor }: DayGroupHeaderProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="label" themeColor="text3">
        {formatDayHeader(dayStartMs)}
      </ThemedText>
      {subtotalMinor !== undefined && subtotalMinor > 0 ? (
        <ThemedText type="label" themeColor="text3">
          {formatMoney(subtotalMinor, { sign: 'none' })}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
});
