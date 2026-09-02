/**
 * `CategoryEditorSheet` — SPEC-UI-UX.md §6.12 / SPEC-implementation.md §29.4. F6. One sheet,
 * mode-aware from `useSheetRegistry().params.categoryId` — no id ⇒ "New category", an id ⇒
 * "Edit category" pre-filled from the live category row. Handles both `'createCategory'` and
 * `'editCategory'` (`SheetHost` routes both `SheetName`s here).
 *
 * Icon grid is the 9 default-category glyphs (`CategoryIcons`, excluding the two system-only
 * ones — Uncategorized's `help-circle` and income's `arrow-down-to-line`) — the "fixed set" the
 * spec asks for; icon reuse across categories is explicitly allowed (§6.12).
 */

import { BottomSheetView } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcons } from '@/constants/category-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  countTransactionsForCategory,
  createCategory,
  deleteCategory,
  DuplicateCategoryNameError,
  updateCategory,
  useCategories,
} from '@/db/repositories/categories';
import { useCategoryDraft, useSheetRegistry } from '@/stores';

import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon, type IconName } from '@/ui/icon';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

const ICON_CHOICES = Object.values(CategoryIcons).filter(
  (name) => name !== 'help-circle' && name !== 'arrow-down-to-line',
) as IconName[];

export function CategoryEditorSheet() {
  const params = useSheetRegistry((s) => s.params) as { categoryId?: string };
  const close = useSheetRegistry((s) => s.close);
  const draft = useCategoryDraft();
  const { data: categories } = useCategories();

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reassignCount, setReassignCount] = useState(0);

  const editing = !!params.categoryId;
  const target = editing ? (categories ?? []).find((c) => c.id === params.categoryId) : undefined;

  useEffect(() => {
    if (editing) {
      if (!target) return; // live category row not loaded yet
      useCategoryDraft.getState().open({ categoryId: target.id, name: target.name, icon: target.icon });
    } else {
      useCategoryDraft.getState().open({ categoryId: null, name: '', icon: ICON_CHOICES[0] });
    }
    // Re-seed only when the target sheet/category changes, not on every `categories` update
    // (would reset in-progress edits while the sheet is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, target?.id]);

  const trimmedName = draft.name.trim();
  const nameTaken =
    trimmedName.length > 0 &&
    (categories ?? []).some(
      (c) => c.id !== draft.categoryId && c.name.toLowerCase() === trimmedName.toLowerCase(),
    );
  const saveDisabled = trimmedName.length === 0 || nameTaken;
  const canDelete = editing && target !== undefined && !target.isProtected;

  const handleCancel = useCallback(() => {
    if (draft.dirty) setShowDiscardConfirm(true);
    else close();
  }, [draft.dirty, close]);

  // Registers this sheet's own Cancel logic (dirty-check + discard confirm, V-6) as the
  // handler `useSheetRegistry().requestClose()` invokes — so the hardware/gesture back button
  // (SheetHost) gets the exact same guard the Cancel button does, not a bypass of it.
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
    if (saveDisabled) return;
    draft.setSubmitting(true);
    try {
      if (draft.categoryId) {
        updateCategory(draft.categoryId, { name: trimmedName, icon: draft.icon });
      } else {
        createCategory({ name: trimmedName, icon: draft.icon });
      }
      draft.reset();
      close();
    } catch (e) {
      draft.setSubmitting(false);
      draft.setError(e instanceof DuplicateCategoryNameError ? e.message : 'Could not save. Try again.');
    }
  };

  const handleDeletePress = () => {
    if (!draft.categoryId) return;
    setReassignCount(countTransactionsForCategory(draft.categoryId));
    setShowDeleteConfirm(true);
  };

  const doDelete = () => {
    if (!draft.categoryId) return;
    setShowDeleteConfirm(false);
    deleteCategory(draft.categoryId);
    draft.reset();
    close();
  };

  return (
    <BottomSheetView>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={handleCancel}>
          <ThemedText type="label" themeColor="text2">
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText type="title" style={styles.headerTitle}>
          {editing ? 'Edit category' : 'New category'}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <ThemedText type="label" themeColor="text3">
          Name
        </ThemedText>
        <TextField
          value={draft.name}
          onChangeText={(name) => draft.patch({ name })}
          maxLength={24}
          placeholder="Category name"
        />
        {nameTaken ? (
          <ThemedText type="caption" themeColor="text" style={styles.error}>
            A category named &ldquo;{trimmedName}&rdquo; already exists.
          </ThemedText>
        ) : null}

        <ThemedText type="label" themeColor="text3" style={styles.iconLabel}>
          Icon
        </ThemedText>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {ICON_CHOICES.map((iconName) => {
            const selected = draft.icon === iconName;
            return (
              <Pressable
                key={iconName}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => draft.patch({ icon: iconName })}
                style={[styles.cell, selected ? styles.cellSelected : null]}
              >
                <Icon name={iconName} size={20} color={selected ? 'primaryInk' : 'text'} />
              </Pressable>
            );
          })}
        </View>

        {draft.error ? (
          <ThemedText type="label" themeColor="text" style={styles.error}>
            {draft.error}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.footer}>
        {canDelete ? (
          <Button variant="ghost" onPress={handleDeletePress} style={styles.deleteButton}>
            Delete
          </Button>
        ) : null}
        <Button
          variant={saveDisabled ? 'disabled' : 'primary'}
          onPress={handleSave}
          loading={draft.submitting}
          style={styles.saveButton}
        >
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
        title="Delete category?"
        body={
          reassignCount > 0
            ? `${reassignCount} transaction${reassignCount === 1 ? '' : 's'} become Uncategorized.`
            : 'This category has no transactions.'
        }
        confirmLabel="Delete"
        onConfirm={doDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </BottomSheetView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.three },
  iconLabel: { marginTop: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: {
    width: 48,
    height: 48,
    borderRadius: Radius.iconTile,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { backgroundColor: Colors.dark.primary },
  error: { paddingHorizontal: Spacing.one },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  deleteButton: { flexBasis: 96, flexGrow: 0 },
  saveButton: { flex: 1 },
});
