/**
 * Review Queue — SPEC-UI-UX.md §6.3, SPEC-implementation.md §30.5. F11.
 *
 * Root-relative navigation (this file lives directly under `src/app/`, not `(tabs)/`) since
 * the full route tree isn't built yet — see `SPEC/traceability.md`.
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
import { setSetting, useSetting } from '@/db/repositories/settings';
import { dismissAllPending, usePendingSuggestions } from '@/db/repositories/suggestions';
import type { Suggestion } from '@/db/schema';
import { isKnownAccountRule } from '@/domain/categorize';
import { usePermissionStatus } from '@/hooks/use-permission-status';
import { cancelAllSuggestionNotifications } from '@/services/notifications/post';
import { handleDiscard, handleSave } from '@/services/notifications/respond';
import { requestSmsPermissions } from '@/services/sms';
import { useSheetRegistry } from '@/stores';

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
  const [confirmingDismissAll, setConfirmingDismissAll] = useState(false);

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
              <Button variant="ghost" onPress={() => setConfirmingDismissAll(true)}>
                Dismiss all
              </Button>
            </View>
          }
        />
      )}

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
  footer: { marginTop: Spacing.three, alignItems: 'center' },
});
