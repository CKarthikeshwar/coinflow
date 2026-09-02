/**
 * `UndoSnackbar` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §27.4. Translucent bar above the
 * nav, message + single "Undo". Purely presentational — the DB-aware wiring (reading `useUndo`,
 * calling `restoreTransaction`) lives in `features/transactions/undo-host.tsx`.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

export type UndoSnackbarProps = {
  visible: boolean;
  message: string;
  onUndo: () => void;
};

export function UndoSnackbar({ visible, message, onUndo }: UndoSnackbarProps) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <ThemedText type="body" themeColor="text" style={styles.message}>
          {message}
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={8}>
          <ThemedText type="label" themeColor="text" style={styles.undo}>
            Undo
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.five,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: 'rgba(36,38,47,0.9)',
  },
  message: { flex: 1 },
  undo: { fontWeight: '700' },
});
