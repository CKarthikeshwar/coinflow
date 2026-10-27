/**
 * `DayGroupHeader` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Plain label (date +
 * optional income / expense totals) between card groups on the Transactions list — not a card (§6.7).
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatDayHeader } from '@/domain/format/when';
import { formatMoney } from '@/domain/format/money';

import { ThemedText } from './themed-text';

export type DayGroupHeaderProps = {
  dayStartMs: number;
  spentMinor?: number;
  incomeMinor?: number;
};

export function DayGroupHeader({ dayStartMs, spentMinor = 0, incomeMinor = 0 }: DayGroupHeaderProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="label" themeColor="text3">
        {formatDayHeader(dayStartMs)}
      </ThemedText>
      {incomeMinor > 0 || spentMinor > 0 ? (
        <ThemedText type="label" themeColor="text3">
          {[incomeMinor > 0 ? formatMoney(incomeMinor) : null, spentMinor > 0 ? formatMoney(-spentMinor) : null]
            .filter(Boolean)
            .join('  ')}
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
