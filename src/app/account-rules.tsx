/**
 * FILE PURPOSE
 * ------------
 * Lets the user see, edit, and delete the "account memory" the app has learned — for each bank
 * account/merchant it has a rule for, which category/note/payment method it auto-fills. This is
 * the only screen that gives the user visibility into `db/repositories/account-rules.ts`'s
 * data, which otherwise updates silently in the background every time a transaction is saved.
 *
 * WHERE IT FITS
 * -------------
 * Reached from the Settings tab (`(tabs)/settings.tsx`'s "Account rules" row, `href="/account-rules"`).
 * A root-relative route (flat under `src/app/`, not nested under `(tabs)/`) since it's a pushed
 * detail screen, not a tab destination — same pattern as `categories.tsx`/`review-queue.tsx`.
 * Tapping a row opens `src/features/settings/account-rule-editor-sheet.tsx` to edit it.
 *
 * IMPORTANT
 * ---------
 * Row delete is a direct tap on a trash icon, not a swipe gesture — same "tap not swipe"
 * simplification used for Categories, Review Queue, and the transaction list.
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
