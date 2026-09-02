/**
 * Review Queue — SPEC-UI-UX.md §6.3, SPEC-implementation.md §30.5. F11.
 *
 * Not yet built (carried forward): tapping a card body should open the Confirmation sheet
 * (`sheets.open('confirm', {suggestionId})`) — that needs the `SheetRegistry` (§28.2) and the
 * Confirmation sheet itself (F3), neither exists yet, so it's a no-op for now. Root-relative
 * navigation (this file lives directly under `src/app/`, not `(tabs)/`) since the full route
 * tree isn't built yet either — see `SPEC/traceability.md`.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { getAccountRule } from '@/db/repositories/account-rules';
import { getSetting, setSetting } from '@/db/repositories/settings';
import { dismissAllPending, usePendingSuggestions } from '@/db/repositories/suggestions';
import type { Suggestion } from '@/db/schema';
import { cancelAllSuggestionNotifications } from '@/services/notifications/post';
import { handleDiscard, handleSave } from '@/services/notifications/respond';
import { getSmsPermissions, requestSmsPermissions } from '@/services/sms';

import { SuggestionCard } from '@/features/detection/suggestion-card';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { EmptyState } from '@/ui/empty-state';
import { PermissionBanner } from '@/ui/permission-banner';
import { Skeleton } from '@/ui/skeleton';
import { TopBar } from '@/ui/top-bar';

function QueueRow({ suggestion }: { suggestion: Suggestion }) {
  const rule = suggestion.normalizedKey ? getAccountRule(suggestion.normalizedKey) : null;
  const known = rule !== null && rule.categoryId !== null;

  return (
    <SuggestionCard
      suggestion={suggestion}
      known={known}
      onOpen={() => {
        // TODO(F3/§28.2): sheets.open('confirm', { suggestionId }) once the Confirmation
        // sheet + SheetRegistry exist.
      }}
      onSave={known ? () => handleSave(suggestion.id) : undefined}
      onDismiss={() => handleDiscard(suggestion.id)}
    />
  );
}

export default function ReviewQueueScreen() {
  const { data, updatedAt } = usePendingSuggestions();
  const rows = data ?? [];
  const loading = updatedAt === undefined;

  const [smsGranted, setSmsGranted] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => getSetting<number | null>('smsBannerDismissedAt', null) !== null,
  );
  const [confirmingDismissAll, setConfirmingDismissAll] = useState(false);

  const checkPermission = useCallback(async () => {
    const perm = await getSmsPermissions();
    setSmsGranted(perm.granted);
  }, []);

  useEffect(() => {
    // Initial check on mount, then re-checked live on foreground (§22.4) via the AppState
    // subscription below — permission status is never stored. `checkPermission` awaits before
    // setting state, so this isn't the synchronous-cascading-render shape the rule guards
    // against; there's no simpler subscription source for "current OS permission state".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermission();
    });
    return () => sub.remove();
  }, [checkPermission]);

  const showBanner = smsGranted === false && !bannerDismissed;

  const handleEnable = async () => {
    await requestSmsPermissions();
    await checkPermission();
  };

  const handleDismissBanner = () => {
    setSetting('smsBannerDismissedAt', Date.now());
    setBannerDismissed(true);
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
