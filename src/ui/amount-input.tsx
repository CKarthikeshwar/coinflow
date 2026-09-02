/**
 * `AmountInput` — SPEC-UI-UX.md V-10 / SPEC-implementation.md §29.4. Large centred figure +
 * caret; `₹` prefix in `text3`; helper line for 0 / over-max. `mode:'summary'` is the slim
 * sticky bar once the sheet is scrolled to the fields (§6.4) — this pass renders it as a
 * plain row rather than an animated collapse; same content, no slide/pin animation yet.
 */

import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/format/money';

import { ThemedText } from './themed-text';

export type AmountInputProps = {
  amountMinor: number;
  mode: 'full' | 'summary';
  helper?: string;
};

export function AmountInput({ amountMinor, mode, helper }: AmountInputProps) {
  const digits = formatMoney(amountMinor, { sign: 'none', withCurrency: false });

  if (mode === 'summary') {
    return (
      <View style={styles.summaryRow}>
        <ThemedText type="label" themeColor="text3">
          Amount
        </ThemedText>
        <ThemedText type="title">₹{digits}</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.full}>
      <View style={styles.figureRow}>
        <ThemedText type="amountHero" themeColor="text3">
          ₹
        </ThemedText>
        <ThemedText type="amountHero">{digits}</ThemedText>
        <View style={styles.caret} />
      </View>
      {helper ? (
        <ThemedText type="label" themeColor="text3" style={styles.helper}>
          {helper}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    gap: Spacing.two,
  },
  figureRow: { flexDirection: 'row', alignItems: 'flex-end' },
  caret: {
    width: 2,
    height: 40,
    marginLeft: Spacing.one,
    marginBottom: 4,
    backgroundColor: Colors.dark.primary,
  },
  helper: { textAlign: 'center' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
