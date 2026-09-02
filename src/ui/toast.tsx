/**
 * `Toast` — SPEC-implementation.md §30.6/§30.7. Translucent bar above the nav, message + an
 * optional single action (e.g. "View"). Same visual shape as `UndoSnackbar`; kept separate since
 * `UndoSnackbar`'s action is hardcoded to "Undo" and this one's label/handler are caller-supplied.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

export type ToastProps = {
  visible: boolean;
  message: string;
  action?: { label: string; onPress: () => void } | null;
};

export function Toast({ visible, message, action }: ToastProps) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <ThemedText type="body" themeColor="text" style={styles.message}>
          {message}
        </ThemedText>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
            <ThemedText type="label" themeColor="text" style={styles.action}>
              {action.label}
            </ThemedText>
          </Pressable>
        ) : null}
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
  action: { fontWeight: '700' },
});
