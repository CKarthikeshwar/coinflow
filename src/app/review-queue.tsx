/**
 * FILE PURPOSE
 * ------------
 * The full list of pending SMS-detected suggestions awaiting the user's confirmation or
 * dismissal — the "inbox" for automatic transaction detection. Reached from Home's action strip
 * ("N to review") and from a notification tap. A root-relative route (flat under `src/app/`,
 * not nested under `(tabs)/`) since it's a pushed detail screen, not a tab destination.
 *
 * WHERE IT FITS
 * -------------
 * Reads `usePendingSuggestions` (`src/db/repositories/suggestions.ts`) for the list, and calls
 * the exact same `handleSave`/`handleDiscard` (`src/services/notifications/respond.ts`) that a
 * notification's action buttons use — so responding to a suggestion here behaves identically to
 * responding from the notification itself.
 *
 * Permission check (F8.5 / CR-5): used to be its own inline `getSmsPermissions` +
 * `AppState`-subscription copy, predating the shared `usePermissionStatus` hook Home (F6.5)
 * introduced. Swapped onto that hook here — the only other change needed to make the swap a
 * real drop-in was the dismiss-state read: this screen used a one-time `useState` snapshot of
 * `getSetting`, Home already used the live `useSetting`; now both do.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { getAccountRule } from '@/db/repositories/account-rules';
import { resolveDefaultCategory, useCategories } from '@/db/repositories/categories';
import { setSetting, useSetting } from '@/db/repositories/settings';
import { dismissAllPending, usePendingSuggestions } from '@/db/repositories/suggestions';
import type { Suggestion } from '@/db/schema';
import { isKnownAccountRule } from '@/domain/categorize';
import { usePermissionStatus } from '@/hooks/use-permission-status';
import { cancelAllSuggestionNotifications } from '@/services/notifications/post';
import { handleDiscard, handleSave, handleSaveAll } from '@/services/notifications/respond';
import { requestSmsPermissions } from '@/services/sms';
import { useSheetRegistry, useToast } from '@/stores';

import { SuggestionCard } from '@/features/detection/suggestion-card';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { EmptyState } from '@/ui/empty-state';
import { PermissionBanner } from '@/ui/permission-banner';
import { Skeleton } from '@/ui/skeleton';
import { TopBar } from '@/ui/top-bar';

function QueueRow({ suggestion }: { suggestion: Suggestion }) {
  const rule = suggestion.normalizedKey ? getAccountRule(suggestion.normalizedKey) : null;
  const known = isKnownAccountRule(rule);
  const openSheet = useSheetRegistry((s) => s.open);

  return (
    <SuggestionCard
      suggestion={suggestion}
      known={known}
      onOpen={() => openSheet('confirm', { suggestionId: suggestion.id })}
      onSave={known ? () => handleSave(suggestion.id) : undefined}
      onDismiss={() => handleDiscard(suggestion.id)}
    />
  );
}

export default function ReviewQueueScreen() {
  const { data, updatedAt } = usePendingSuggestions();
  const rows = data ?? [];
  const loading = updatedAt === undefined;

  const permission = usePermissionStatus();
  const smsBanner = useSetting<number | null>('smsBannerDismissedAt');
  const defaultId = useSetting<string | null>('defaultCategoryId');
  const { data: categoryList } = useCategories();
  const defaultCategory = resolveDefaultCategory(defaultId.value, categoryList ?? []);
  const showToast = useToast((s) => s.show);
  const [confirmingDismissAll, setConfirmingDismissAll] = useState(false);
  const [confirmingSaveAll, setConfirmingSaveAll] = useState(false);

  const showBanner = permission.sms === 'denied' && smsBanner.value == null;

  const handleEnable = async () => {
    await requestSmsPermissions();
    permission.refresh();
  };

  const handleDismissBanner = () => {
    setSetting('smsBannerDismissedAt', Date.now());
  };

  const handleDismissAll = async () => {
    setConfirmingDismissAll(false);
    dismissAllPending();
    await cancelAllSuggestionNotifications();
  };

  // CR-12: with no default set, "Save all" sends the user to pick one first.
  const handleSaveAllPress = () => {
    if (!defaultCategory) {
      router.push('/default-category' as never);
      return;
    }
    setConfirmingSaveAll(true);
  };

  const handleConfirmSaveAll = async () => {
    setConfirmingSaveAll(false);
    if (!defaultCategory) return;
    const { saved, skipped } = await handleSaveAll(defaultCategory.id);
    const base = `Saved ${saved} transaction${saved === 1 ? '' : 's'}`;
    showToast(skipped > 0 ? `${base} · ${skipped} left to review` : base);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="To review" count={rows.length} onBack={() => router.back()} />

      {showBanner ? (
        <PermissionBanner kind="sms" onEnable={handleEnable} onDismiss={handleDismissBanner} />
      ) : null}

      {loading ? (
        <Skeleton layout="suggestion-list" />
      ) : rows.length === 0 ? (
        <EmptyState glyph="check" line="You're all caught up. New transactions show up here." />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <QueueRow suggestion={item} />}
          ListFooterComponent={
            <View style={styles.footer}>
              <Button onPress={handleSaveAllPress}>
                {defaultCategory ? `Save all as ${defaultCategory.name}` : 'Save all with default category'}
              </Button>
              <Button variant="ghost" onPress={() => setConfirmingDismissAll(true)}>
                Dismiss all
              </Button>
            </View>
          }
        />
      )}

      <ConfirmDialog
        visible={confirmingSaveAll}
        glyph="check"
        title={`Save ${rows.length} transaction${rows.length === 1 ? '' : 's'}?`}
        body={`Expenses use ${defaultCategory?.name ?? 'your default category'} unless the account already has a category. Income stays uncategorized.`}
        confirmLabel="Save all"
        onConfirm={handleConfirmSaveAll}
        onCancel={() => setConfirmingSaveAll(false)}
      />

      <ConfirmDialog
        visible={confirmingDismissAll}
        glyph="trash-2"
        title="Dismiss all?"
        body={`${rows.length} pending transaction${rows.length === 1 ? '' : 's'} will be removed.`}
        confirmLabel="Dismiss all"
        onConfirm={handleDismissAll}
        onCancel={() => setConfirmingDismissAll(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  footer: { marginTop: Spacing.three, alignItems: 'center', gap: Spacing.one },
});
