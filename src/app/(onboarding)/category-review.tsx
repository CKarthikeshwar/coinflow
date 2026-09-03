/**
 * Onboarding — Category review — SPEC-UI-UX.md §6.1, SPEC-implementation.md §30.3 (UI-060/062,
 * IMP-017). F12.
 *
 * Named `category-review.tsx`, not the spec's literal `(onboarding)/categories.tsx` — that path
 * would collide with the already-built `src/app/categories.tsx` (F6, Category management):
 * `(onboarding)` is a route *group* (adds no URL segment), so both files would resolve to the
 * same `/categories` path. Same screen the spec describes, different filename to avoid the clash.
 *
 * Shows the 8 real default categories (`kind:'default' && !isProtected`) as toggleable rows —
 * not literally all 9 `kind:'default'` rows as §6.1's list implies. "Other" is `kind:'default'`
 * but `isProtected:true`; deselecting-as-delete can't apply to a category `deleteCategory`
 * refuses to remove. Same "protected categories get no delete affordance, silently" rule
 * `categories.tsx` (F6) already established — not a new exception, followed here instead of
 * re-litigated.
 *
 * Reorder is the spec's own "optional" — not built this pass; `reorderCategories` (F6) exists
 * and is ready for it if a later pass adds a drag handle.
 */

import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { deleteCategory, useCategories } from '@/db/repositories/categories';
import { setSetting } from '@/db/repositories/settings';
import { useOnboarding } from '@/stores';

import { OnboardingGraphic } from '@/features/onboarding/onboarding-graphic';
import { OnboardingLayout } from '@/features/onboarding/onboarding-layout';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export default function CategoryReviewScreen() {
  const goTo = useOnboarding((s) => s.goTo);
  const disabledIds = useOnboarding((s) => s.disabledCategoryIds);
  const toggleCategory = useOnboarding((s) => s.toggleCategory);
  const { data: categories } = useCategories();

  useEffect(() => {
    goTo(3);
  }, [goTo]);

  const reviewable = (categories ?? []).filter((c) => c.kind === 'default' && !c.isProtected);

  const handleDone = () => {
    const { disabledCategoryIds, categoryOrder } = useOnboarding.getState();
    for (const id of disabledCategoryIds) deleteCategory(id);
    // Reorder is optional (§6.1) and not built this pass — `categoryOrder` stays null until a
    // drag handle exists to set it, so this is a no-op today, not dead code.
    void categoryOrder;
    setSetting('onboardingDone', true);
    useOnboarding.getState().reset();
    // §30.3 "replace nav with (tabs)" — explicit, not left to the root `<Redirect>`'s live
    // `useSetting` alone (which also picks this up, but relying on that for the in-app
    // transition risks a stale current-route mismatch; this makes it immediate and certain).
    router.replace('/');
  };

  return (
    <OnboardingLayout step={3} onBack={() => router.back()} footer={<Button onPress={handleDone}>Done</Button>}>
      <OnboardingGraphic variant="categories" />
      <ThemedText type="title" style={styles.heading}>
        Pick your categories
      </ThemedText>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {reviewable.map((cat) => {
          const checked = !disabledIds.includes(cat.id);
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => toggleCategory(cat.id)}
              style={styles.row}
            >
              <View style={styles.tile}>
                <Icon name={cat.icon as IconName} size={18} />
              </View>
              <ThemedText type="body" themeColor="text" style={styles.rowLabel}>
                {cat.name}
              </ThemedText>
              <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
                {checked ? <Icon name="check" size={14} color="primaryInk" /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  heading: { textAlign: 'center' },
  list: { flex: 1, alignSelf: 'stretch' },
  listContent: {
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56 },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.dark.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
});
