/**
 * `ConfirmDialog` — SPEC-UI-UX.md §3.6 / V-7. Centred card on a heavy scrim; a quiet glyph in
 * a `surface3` circle, title, a short body. Actions are stacked full-width: filled + bold
 * confirm on top, plain-text Cancel below. No red — the glyph/weight carry the warning.
 *
 * `twoStep` (F8.5, UI-065) — Settings' Clear all data is the one caller: the confirm button is
 * disabled until the user types `CONFIRM` into an inset text field, an extra friction step this
 * dialog's every other caller doesn't need (their worst case is losing unsaved input / an
 * Uncategorized reassignment; this one's is wiping the whole database). The field resets on
 * every closing path (confirm, Cancel, scrim tap, hardware back) — all of which already funnel
 * through `handleConfirm`/`handleCancel` below, so the reset is a plain event-handler side
 * effect, not a `visible`-watching `useEffect` (which would itself need to call `setState`
 * synchronously inside the effect body, the exact pattern this codebase's lint rule forbids).
 */

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon, type IconName } from './icon';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';

const TWO_STEP_PHRASE = 'CONFIRM';

export type ConfirmDialogProps = {
  visible: boolean;
  glyph: IconName;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Requires typing "CONFIRM" before the confirm action enables (UI-065). */
  twoStep?: boolean;
};

export function ConfirmDialog({
  visible,
  glyph,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  twoStep = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  const confirmDisabled = twoStep && typed !== TWO_STEP_PHRASE;

  const handleConfirm = () => {
    setTyped('');
    onConfirm();
  };
  const handleCancel = () => {
    setTyped('');
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable style={styles.scrim} onPress={handleCancel}>
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
          {twoStep ? (
            <View style={styles.twoStepField}>
              <TextField
                value={typed}
                onChangeText={setTyped}
                placeholder={TWO_STEP_PHRASE}
                autoCapitalize="characters"
              />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: confirmDisabled }}
            disabled={confirmDisabled}
            style={[styles.confirmButton, confirmDisabled ? styles.confirmButtonDisabled : null]}
            onPress={handleConfirm}
          >
            <ThemedText
              type="label"
              themeColor={confirmDisabled ? 'text3' : 'primaryInk'}
              style={styles.confirmLabel}
            >
              {confirmLabel}
            </ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={handleCancel}>
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
  twoStepField: { width: '100%', marginBottom: Spacing.one },
  confirmButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: { backgroundColor: Colors.dark.surface2 },
  confirmLabel: { fontWeight: '700' },
  cancelButton: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
