/**
 * FILE PURPOSE
 * ------------
 * Manage all categories: reorder them (drag), rename/change icon (opens the category editor
 * sheet), and delete a custom one (reassigning its transactions to Uncategorized first — see
 * `db/repositories/categories.ts`'s `deleteCategory`).
 *
 * WHERE IT FITS
 * -------------
 * Reached two ways: from the Settings tab's "Categories" row (`href="/categories"`), and from
 * the Category Picker sheet's "Manage categories →" link
 * (`src/features/categories/category-picker-sheet.tsx`). A root-relative route (flat under
 * `src/app/`, not nested under `(tabs)/`) since it's a pushed detail screen, not a tab
 * destination — same pattern as `account-rules.tsx`/`review-queue.tsx`.
 *
 * IMPORTANT
 * ---------
 * Row delete is a direct tap on a trash icon, not a swipe gesture — same "tap not swipe"
 * simplification already used for Review Queue's dismiss and the transaction list's delete.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import {
  countTransactionsForCategory,
  deleteCategory,
  useCategories,
} from '@/db/repositories/categories';
import type { Category } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

function CategoryRow({
  category,
  onEdit,
  onDeletePress,
}: {
  category: Category;
  onEdit: () => void;
  onDeletePress: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={onEdit} style={styles.rowMain}>
        <View style={styles.tile}>
          <Icon name={category.icon as IconName} size={18} />
        </View>
        <ThemedText type="body" themeColor="text" style={styles.label} numberOfLines={1}>
          {category.name}
        </ThemedText>
      </Pressable>
      {!category.isProtected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${category.name}`}
          onPress={onDeletePress}
          hitSlop={8}
          style={styles.deleteTap}
        >
          <Icon name="trash-2" size={16} color="text3" />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8} style={styles.chevronTap}>
        <Icon name="chevron-right" size={16} color="text3" />
      </Pressable>
    </View>
  );
}

export default function CategoriesScreen() {
  const { data: categories } = useCategories();
  const openSheet = useSheetRegistry((s) => s.open);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [reassignCount, setReassignCount] = useState(0);

  const defaults = (categories ?? []).filter((c) => c.kind !== 'custom');
  const custom = (categories ?? []).filter((c) => c.kind === 'custom');

  const editCategory = (id: string) => openSheet('editCategory', { categoryId: id });
  const requestDelete = (category: Category) => {
    setReassignCount(countTransactionsForCategory(category.id));
    setDeleting(category);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    deleteCategory(deleting.id);
    setDeleting(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar
        title="Categories"
        onBack={() => router.back()}
        right={{ icon: 'plus', label: 'Add category', onPress: () => openSheet('createCategory', {}) }}
      />

      <View style={styles.body}>
        <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
          Default
        </ThemedText>
        <View style={styles.section}>
          {defaults.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              onEdit={() => editCategory(category.id)}
              onDeletePress={() => requestDelete(category)}
            />
          ))}
        </View>

        <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
          Custom
        </ThemedText>
        <View style={styles.section}>
          {custom.length === 0 ? (
            <ThemedText type="body" themeColor="text3" style={styles.emptyCustom}>
              No custom categories yet.
            </ThemedText>
          ) : (
            custom.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                onEdit={() => editCategory(category.id)}
                onDeletePress={() => requestDelete(category)}
              />
            ))
          )}
        </View>

        <ThemedText type="caption" themeColor="text3" style={styles.note}>
          Tap a category to edit it. Deleting one moves its transactions to Uncategorized. Other
          and Uncategorized can be renamed but not removed.
        </ThemedText>
      </View>

      <ConfirmDialog
        visible={deleting !== null}
        glyph="trash-2"
        title="Delete category?"
        body={
          reassignCount > 0
            ? `${reassignCount} transaction${reassignCount === 1 ? '' : 's'} become Uncategorized.`
            : 'This category has no transactions.'
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.three },
  sectionLabel: { paddingTop: Spacing.three, paddingBottom: Spacing.one },
  section: {
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  deleteTap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  chevronTap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  emptyCustom: { paddingVertical: Spacing.three, textAlign: 'center' },
  note: { paddingTop: Spacing.three, paddingBottom: Spacing.five },
});
