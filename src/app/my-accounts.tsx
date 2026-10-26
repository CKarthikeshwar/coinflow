/**
 * FILE PURPOSE
 * ------------
 * My accounts (SPEC-UI-UX.md §6.25 UI-103, SPEC-implementation.md §46.9) — the user's own bank accounts, cards,
 * wallets and cash, in four sections (Bank accounts · Cards · Wallets · Cash). Tap a row to edit it; **Add account**
 * under each section. Accounts detected from bank texts carry a **New** pill until opened (UI-104). Archived ones
 * hide behind "Show archived".
 *
 * WHERE IT FITS
 * -------------
 * Reached from Settings › My accounts and from the balance card on Home. Rows open the shared account sheet
 * (`features/accounts/account-sheet.tsx`) through `SheetHost`.
 *
 * NOT YET (phase D / E of §46.11): the Total balance card, each row's balance + "as of", Needs a look, card bills.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/db/repositories/accounts';
import type { MyAccount } from '@/db/schema';
import { ACCOUNT_SECTIONS } from '@/domain/accounts/method-kinds';
import { ACCOUNT_KIND_ICON, accountSubtitle } from '@/features/accounts/account-label';
import { useSheetRegistry } from '@/stores';

import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

function AccountRow({ account, onPress }: { account: MyAccount; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={account.nickname} onPress={onPress} style={styles.row}>
      <View style={styles.tile}>
        <Icon name={ACCOUNT_KIND_ICON[account.kind]} size={18} />
      </View>
      <View style={styles.rowText}>
        <ThemedText type="body" themeColor={account.archivedAt ? 'text3' : 'text'} numberOfLines={1}>
          {account.nickname}
        </ThemedText>
        <ThemedText type="caption" themeColor="text3" numberOfLines={1}>
          {accountSubtitle(account)}
          {account.archivedAt ? ' · Archived' : ''}
        </ThemedText>
      </View>
      {account.autoCreated ? (
        <View style={styles.newPill}>
          <ThemedText type="caption" themeColor="primaryInk">
            New
          </ThemedText>
        </View>
      ) : null}
      <Icon name="chevron-right" size={16} color="text3" />
    </Pressable>
  );
}

export default function MyAccountsScreen() {
  const { data: accounts } = useAccounts();
  const openSheet = useSheetRegistry((s) => s.open);
  const [showArchived, setShowArchived] = useState(false);

  const all = accounts ?? [];
  const visible = all.filter((a) => showArchived || !a.archivedAt);
  const archivedCount = all.filter((a) => a.archivedAt).length;

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar
        title="My accounts"
        onBack={() => router.back()}
        right={{ icon: 'plus', label: 'Add account', onPress: () => openSheet('createAccount', {}) }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        {all.length === 0 ? (
          <EmptyState
            glyph="landmark"
            line="Accounts appear here as your bank texts arrive — or add one yourself."
            cta={{ label: 'Add account', onPress: () => openSheet('createAccount', {}) }}
          />
        ) : (
          ACCOUNT_SECTIONS.map(({ kind, title }) => {
            const rows = visible.filter((a) => a.kind === kind);
            return (
              <View key={kind}>
                <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
                  {title}
                </ThemedText>
                <View style={styles.section}>
                  {rows.map((account) => (
                    <AccountRow key={account.id} account={account} onPress={() => openSheet('editAccount', { accountId: account.id })} />
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${title.toLowerCase()}`}
                    onPress={() => openSheet('createAccount', { kind })}
                    style={styles.addRow}
                  >
                    <Icon name="plus" size={16} color="text3" />
                    <ThemedText type="label" themeColor="text2">
                      Add account
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {archivedCount > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setShowArchived((v) => !v)} style={styles.archivedToggle}>
            <ThemedText type="label" themeColor="text2">
              {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
            </ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five },
  sectionLabel: { paddingTop: Spacing.three, paddingBottom: Spacing.one },
  section: { borderRadius: 14, backgroundColor: Colors.dark.surface2, paddingHorizontal: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 60 },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  newPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.primary,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  archivedToggle: { alignItems: 'center', paddingVertical: Spacing.four },
});
