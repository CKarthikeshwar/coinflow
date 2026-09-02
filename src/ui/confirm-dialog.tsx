/**
 * `ConfirmDialog` — SPEC-UI-UX.md §3.6 / V-7. Centred card on a heavy scrim; a quiet glyph in
 * a `surface3` circle, title, a short body. Actions are stacked full-width: filled + bold
 * confirm on top, plain-text Cancel below. No red — the glyph/weight carry the warning.
 *
 * `twoStep` (type-CONFIRM field) isn't implemented yet — no caller needs it in this pass
 * (Settings' clear-all-data will, later).
 */

import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export type ConfirmDialogProps = {
  visible: boolean;
  glyph: IconName;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ visible, glyph, title, body, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.glyphCircle}>
            <Icon name={glyph} size={22} />
          </View>
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText type="body" themeColor="text2" style={styles.body}>
            {body}
          </ThemedText>
          <Pressable accessibilityRole="button" style={styles.confirmButton} onPress={onConfirm}>
            <ThemedText type="label" themeColor="primaryInk" style={styles.confirmLabel}>
              {confirmLabel}
            </ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onCancel}>
            <ThemedText type="label" themeColor="text2">
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
  },
  glyphCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginBottom: Spacing.two },
  confirmButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: { fontWeight: '700' },
  cancelButton: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
