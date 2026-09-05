/**
 * The category-selection list shown when the user taps the category field inside the
 * Add/Confirm/Edit sheet. Writes the chosen category straight into `useAddSheetDraft` (the
 * same draft the transaction sheet is editing), then re-opens whichever sheet opened this
 * picker (`params.returnTo`) — this picker itself never touches a transaction directly, it's
 * always a temporary detour from one of the transaction sheets. "Manage categories →" instead
 * closes everything and navigates to the full Categories screen (`src/app/categories.tsx`).
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useCategories } from '@/db/repositories/categories';
import { useAddSheetDraft, useSheetRegistry } from '@/stores';
import type { SheetName } from '@/stores/sheet-registry';

import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export function CategoryPickerSheet() {
  const { data: categories } = useCategories();
  const categoryId = useAddSheetDraft((s) => s.categoryId);
  const patch = useAddSheetDraft((s) => s.patch);
  const open = useSheetRegistry((s) => s.open);
  const close = useSheetRegistry((s) => s.close);
  const params = useSheetRegistry((s) => s.params) as { returnTo?: SheetName };

  const returnToParent = useCallback(() => open(params.returnTo ?? 'add', params), [open, params]);

  // Reopens whichever sheet actually opened the picker (Add/Confirm/Edit all pass their own
  // `mode` through as `returnTo`) — not hardcoded to Confirm, which used to silently turn an Add
  // or Edit sheet into a Confirm sheet (wrong title, wrong validation gate) the moment a category
  // was picked. Falls back to `add` only for the unreachable case of a missing `returnTo`.
  const pick = (id: string | null) => {
    patch({ categoryId: id });
    returnToParent();
  };

  // Regression (2026-09-04, found via a real-device Maestro back-navigation check): this sheet
  // is always a *sub*-sheet of Add/Edit/Confirm, never a standalone one — but it never used to
  // register a `requestClose` handler, so `SheetHost`'s hardware-back interceptor fell through
  // to `sheet-registry.ts`'s plain-`close()` default (written for sheets with genuinely nothing
  // to guard, e.g. Filter). Since the picker has no on-screen Cancel/back control of its own,
  // hardware back was the *only* way to leave without picking a category — and it silently blew
  // away the whole sheet stack, discarding whatever amount/fields the user had already typed
  // into the parent Add/Edit/Confirm sheet, with no "Discard changes?" prompt. Registering this
  // reuses the exact same reopen-the-parent path `pick()` already takes, just without touching
  // `categoryId` — so back now behaves like "cancel out of the picker," not "cancel everything."
  useEffect(() => {
    useSheetRegistry.getState().setOnRequestClose(returnToParent);
    return () => useSheetRegistry.getState().setOnRequestClose(null);
  }, [returnToParent]);

  const manageCategories = () => {
    close();
    router.push('/categories');
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.list}>
      <ThemedText type="title" style={styles.title}>
        Category
      </ThemedText>
      {(categories ?? []).map((cat) => {
        const isUncategorized = cat.key === 'uncategorized';
        const value = isUncategorized ? null : cat.id;
        const selected = categoryId === value;
        return (
          <Pressable
            key={cat.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => pick(value)}
            style={styles.row}
          >
            <View style={styles.tile}>
              <Icon name={cat.icon as IconName} size={18} />
            </View>
            <ThemedText type="body" themeColor="text" style={styles.label}>
              {cat.name}
            </ThemedText>
            {selected ? <Icon name="check" size={18} /> : null}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" onPress={manageCategories} style={styles.manageRow}>
        <ThemedText type="label" themeColor="text2">
          Manage categories
        </ThemedText>
        <Icon name="chevron-right" size={16} color="text3" />
      </Pressable>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five },
  title: { paddingVertical: Spacing.three },
  row: {
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
  label: { flex: 1 },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    marginTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
    paddingTop: Spacing.two,
  },
});
