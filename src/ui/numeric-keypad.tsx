/**
 * `NumericKeypad` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. 3×4, hairline grid,
 * tabular, amount entry only.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { KeypadKey } from '@/stores/keypad';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

const ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
];

export type NumericKeypadProps = { onKey: (key: KeypadKey) => void };

export function NumericKeypad({ onKey }: NumericKeypadProps) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === 'back' ? 'Backspace' : key}
              onPress={() => onKey(key)}
              style={styles.key}
            >
              {key === 'back' ? (
                <Icon name="delete" size={20} color="text2" />
              ) : (
                <ThemedText type="title" style={styles.keyLabel}>
                  {key}
                </ThemedText>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.dark.hairline },
  row: { flexDirection: 'row' },
  key: {
    flex: 1,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  keyLabel: { fontVariant: ['tabular-nums'] },
});
