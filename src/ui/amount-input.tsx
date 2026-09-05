/**
 * The big amount display in the Add/Confirm sheet — purely a display component, not an actual
 * text input; the number it shows comes from `src/stores/keypad.ts`, which the on-screen
 * `NumericKeypad` writes into. `mode: 'full'` is the large centered hero figure shown while
 * actively entering the amount; `mode: 'summary'` is the slim row shown once the user has
 * scrolled down to the other fields, so the amount stays visible but out of the way.
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
