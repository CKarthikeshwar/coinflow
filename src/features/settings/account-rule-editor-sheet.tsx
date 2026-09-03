/**
 * `AccountRuleEditorSheet` — SPEC-implementation.md §21.3/§30.16, SPEC-UI-UX.md §6.14 (D16). F8.
 * Edits an existing `AccountRule`'s remembered note + category — there's no "create" mode, rules
 * are only ever seeded by `upsertFromTransaction` the first time an account is saved on a
 * transaction. Mirrors `CategoryEditorSheet`'s shape (header Cancel/title, dirty-tracked draft,
 * discard + delete `ConfirmDialog`s) rather than routing through the transaction-draft-coupled
 * `CategoryPickerSheet` — category selection here is a simple inline single-select list, not a
 * second sheet hop.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { deleteAccountRule, updateAccountRule, useAccountRules } from '@/db/repositories/account-rules';
import { useCategories } from '@/db/repositories/categories';
import { useAccountRuleDraft, useSheetRegistry } from '@/stores';

import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon, type IconName } from '@/ui/icon';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

export function AccountRuleEditorSheet() {
  const params = useSheetRegistry((s) => s.params) as { normalizedKey?: string };
  const close = useSheetRegistry((s) => s.close);
  const draft = useAccountRuleDraft();
  const { data: rules } = useAccountRules();
  const { data: categories } = useCategories();

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const target = (rules ?? []).find((r) => r.normalizedKey === params.normalizedKey);

  useEffect(() => {
    if (!target) return; // live row not loaded yet
    useAccountRuleDraft.getState().open({
      normalizedKey: target.normalizedKey,
      lastNote: target.lastNote ?? '',
      categoryId: target.categoryId,
    });
    // Re-seed only when the target row identity changes, not on every `rules` update (would
    // reset an in-progress edit while the sheet is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.normalizedKey]);

  const handleCancel = useCallback(() => {
    if (draft.dirty) setShowDiscardConfirm(true);
    else close();
  }, [draft.dirty, close]);

  // Same back/scrim discard-guard wiring as `CategoryEditorSheet` (V-6).
  useEffect(() => {
    useSheetRegistry.getState().setOnRequestClose(handleCancel);
    return () => useSheetRegistry.getState().setOnRequestClose(null);
  }, [handleCancel]);

  const doDiscard = () => {
    setShowDiscardConfirm(false);
    draft.reset();
    close();
  };

  const handleSave = () => {
    if (!draft.normalizedKey) return;
    draft.setSubmitting(true);
    const trimmedNote = draft.lastNote.trim();
    updateAccountRule(draft.normalizedKey, {
      lastNote: trimmedNote === '' ? null : trimmedNote,
      categoryId: draft.categoryId,
    });
    draft.reset();
    close();
  };

  const doDelete = () => {
    if (!draft.normalizedKey) return;
    setShowDeleteConfirm(false);
    deleteAccountRule(draft.normalizedKey);
    draft.reset();
    close();
  };

  if (!target) return null; // row was deleted elsewhere while this sheet was open

  return (
    <BottomSheetScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={handleCancel}>
          <ThemedText type="label" themeColor="text2">
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText type="title" style={styles.headerTitle}>
          Edit rule
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <ThemedText type="label" themeColor="text3">
          Account
        </ThemedText>
        <ThemedText type="body" themeColor="text" style={styles.account}>
          {target.displayAccount}
        </ThemedText>

        <ThemedText type="label" themeColor="text3" style={styles.fieldLabel}>
          Note
        </ThemedText>
        <TextField
          value={draft.lastNote}
          onChangeText={(lastNote) => draft.patch({ lastNote })}
          placeholder="No note"
        />

        <ThemedText type="label" themeColor="text3" style={styles.fieldLabel}>
          Category
        </ThemedText>
        <View style={styles.categoryList} accessibilityRole="radiogroup">
          {(categories ?? []).map((cat) => {
            const isUncategorized = cat.key === 'uncategorized';
            const value = isUncategorized ? null : cat.id;
            const selected = draft.categoryId === value;
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => draft.patch({ categoryId: value })}
                style={styles.categoryRow}
              >
                <View style={styles.tile}>
                  <Icon name={cat.icon as IconName} size={18} />
                </View>
                <ThemedText type="body" themeColor="text" style={styles.categoryLabel}>
                  {cat.name}
                </ThemedText>
                {selected ? <Icon name="check" size={18} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Button variant="ghost" onPress={() => setShowDeleteConfirm(true)} style={styles.deleteButton}>
          Delete
        </Button>
        <Button variant="primary" onPress={handleSave} loading={draft.submitting} style={styles.saveButton}>
          Save
        </Button>
      </View>

      <ConfirmDialog
        visible={showDiscardConfirm}
        glyph="triangle-alert"
        title="Discard changes?"
        body="Your edits won't be saved."
        confirmLabel="Discard"
        onConfirm={doDiscard}
        onCancel={() => setShowDiscardConfirm(false)}
      />
      <ConfirmDialog
        visible={showDeleteConfirm}
        glyph="trash-2"
        title="Delete this rule?"
        body="CoinFlow won't remember this account's note, category, or method anymore."
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: Spacing.five },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  body: { paddingHorizontal: Spacing.three, gap: Spacing.one },
  account: { paddingBottom: Spacing.two },
  fieldLabel: { marginTop: Spacing.two },
  categoryList: { marginTop: Spacing.one },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
  },
  tile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: { flex: 1 },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  deleteButton: { flexBasis: 96, flexGrow: 0 },
  saveButton: { flex: 1 },
});
