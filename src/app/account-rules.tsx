/**
 * Account rules — SPEC-UI-UX.md §6.14, SPEC-implementation.md §30.16 (D16). F8. The only window
 * into F8's account-memory behaviour (`upsertFromTransaction`/`getAccountRule`, already wired
 * since F2/F3/F4/F11) — read + edit + delete learned rules.
 *
 * Root-relative route (flat under `src/app/`, same pattern as `categories.tsx`/
 * `review-queue.tsx`) — the full Settings subpage tree is F8.5's job, not this one's. Reached
 * today via a temporary link on the Settings tab stub; F8.5 will replace that stub with the real
 * grouped list, whose own "Account rules" row will point at this same screen, already built.
 *
 * Simplification vs. spec (documented, not silent): row delete is a direct tap on a trash icon,
 * not a swipe gesture — same "tap not swipe" simplification already used for Categories.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { deleteAccountRule, useAccountRules } from '@/db/repositories/account-rules';
import { useCategories } from '@/db/repositories/categories';
import type { AccountRule } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import { AccountRuleRow } from '@/features/settings/account-rule-row';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

export default function AccountRulesScreen() {
  const { data: rules } = useAccountRules();
  const { data: categories } = useCategories();
  const openSheet = useSheetRegistry((s) => s.open);
  const [deleting, setDeleting] = useState<AccountRule | null>(null);

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  const confirmDelete = () => {
    if (!deleting) return;
    deleteAccountRule(deleting.normalizedKey);
    setDeleting(null);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Account rules" onBack={() => router.back()} />

      <View style={styles.body}>
        {(rules ?? []).length === 0 ? (
          <ThemedText type="body" themeColor="text3" style={styles.empty}>
            No rules yet. CoinFlow learns one automatically the first time you save a transaction
            with an account.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {(rules ?? []).map((rule) => (
              <AccountRuleRow
                key={rule.normalizedKey}
                rule={rule}
                category={rule.categoryId ? categoryById.get(rule.categoryId) : undefined}
                onPress={() => openSheet('editAccountRule', { normalizedKey: rule.normalizedKey })}
                onDeletePress={() => setDeleting(rule)}
              />
            ))}
          </View>
        )}
      </View>

      <ConfirmDialog
        visible={deleting !== null}
        glyph="trash-2"
        title="Delete this rule?"
        body="CoinFlow won't remember this account's note, category, or method anymore."
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
  list: { gap: Spacing.two, paddingTop: Spacing.two },
  empty: { paddingTop: Spacing.five, textAlign: 'center' },
});
