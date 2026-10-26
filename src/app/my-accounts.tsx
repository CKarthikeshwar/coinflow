/**
 * FILE PURPOSE
 * ------------
 * My accounts (SPEC-UI-UX.md §6.25 UI-103, SPEC-implementation.md §46.9) — the user's own bank accounts, cards,
 * wallets and cash, in four sections (Bank accounts · Cards · Wallets · Cash), under a **Total balance** card
 * (bank + wallet + cash; cards are not your money, D49 — they add a "Credit available" line). Each row shows its
 * balance and how old that figure is ("as of 3h ago", amber after 3 days — an old figure must not look current), a
 * **Needs a look** pill when the bank's balance moved more than the recorded transactions explain (UI-107), and for a
 * card its next bill ("Bill ₹14,200 due 5 Nov", UI-108). Tap a row to edit it; **Add account** under each section.
 * Accounts detected from bank texts carry a **New** pill until opened (UI-104). Archived ones hide behind
 * "Show archived".
 *
 * WHERE IT FITS
 * -------------
 * Reached from Settings › My accounts, the Home balance card, and a card-bill reminder. Rows open the shared account
 * sheet (`features/accounts/account-sheet.tsx`) through `SheetHost`. Balances are derived live (`useAccountViews`).
 */

import { format } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/db/repositories/accounts';
import { useAccountViews, type AccountView } from '@/db/repositories/balances';
import { totalBalance } from '@/domain/accounts/balance';
import { ACCOUNT_SECTIONS } from '@/domain/accounts/method-kinds';
import { formatMoney } from '@/domain/format/money';
import { formatWhen } from '@/domain/format/when';
import { ACCOUNT_KIND_ICON, accountSubtitle } from '@/features/accounts/account-label';
import { NeedsALookCards } from '@/features/accounts/needs-a-look-cards';
import { useSheetRegistry } from '@/stores';

import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

const money = (minor: number) => formatMoney(minor, { sign: 'negativeOnly' });

function Pill({ label, tone }: { label: string; tone: 'new' | 'warn' }) {
  return (
    <View style={[styles.pill, tone === 'warn' ? styles.pillWarn : styles.pillNew]}>
      <ThemedText type="caption" themeColor="primaryInk">
        {label}
      </ThemedText>
    </View>
  );
}

function AccountRow({ view, now, onPress }: { view: AccountView; now: number; onPress: () => void }) {
  const { account, balance, stale, discrepancies } = view;
  const isCard = account.kind === 'credit_card';
  const billDue = isCard && account.dueAt !== null && account.dueAmountMinor !== null && account.dueAt >= now - 86_400_000;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={account.nickname} onPress={onPress} style={styles.row}>
      <View style={styles.tile}>
        <Icon name={ACCOUNT_KIND_ICON[account.kind]} size={18} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <ThemedText type="body" themeColor={account.archivedAt ? 'text3' : 'text'} numberOfLines={1} style={styles.name}>
            {account.nickname}
          </ThemedText>
          {account.autoCreated ? <Pill label="New" tone="new" /> : null}
          {discrepancies.length > 0 ? <Pill label="Needs a look" tone="warn" /> : null}
        </View>
        <ThemedText type="caption" themeColor="text3" numberOfLines={1}>
          {accountSubtitle(account)}
          {account.archivedAt ? ' · Archived' : ''}
        </ThemedText>
        {billDue ? (
          <ThemedText type="caption" themeColor="text2">
            Bill {formatMoney(account.dueAmountMinor!, { sign: 'none' })} due {format(account.dueAt!, 'd MMM')}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.amountCol}>
        {balance ? (
          <>
            <ThemedText type="body" themeColor="text">
              {money(balance.balanceMinor)}
            </ThemedText>
            <ThemedText type="caption" themeColor={stale ? 'warn' : 'text3'}>
              {isCard ? 'available · ' : ''}as of {formatWhen(balance.asOf, now)}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="caption" themeColor="text3">
            No balance yet
          </ThemedText>
        )}
      </View>
      <Icon name="chevron-right" size={16} color="text3" />
    </Pressable>
  );
}

function TotalCard({ views, now }: { views: readonly AccountView[]; now: number }) {
  const total = totalBalance(
    views.map((v) => ({ kind: v.account.kind, archived: v.account.archivedAt !== null, balance: v.balance })),
  );
  const accountsWord = (n: number) => `${n} account${n === 1 ? '' : 's'}`;
  return (
    <Card elevation="card" style={styles.total}>
      <ThemedText type="label" themeColor="text2">
        Total balance
      </ThemedText>
      {total.knownCount > 0 ? (
        <>
          <ThemedText type="analyticsNet">{money(total.totalMinor)}</ThemedText>
          <ThemedText type="caption" themeColor="text3">
            across {accountsWord(total.knownCount)}
            {total.oldestAsOf !== null ? ` · oldest figure ${formatWhen(total.oldestAsOf, now)}` : ''}
            {total.unknownCount > 0 ? ` · ${accountsWord(total.unknownCount)} without a balance` : ''}
          </ThemedText>
        </>
      ) : (
        <ThemedText type="caption" themeColor="text3">
          No balances yet — they appear as your bank texts arrive, or type one into an account.
        </ThemedText>
      )}
      {total.creditAvailableMinor !== null ? (
        <ThemedText type="label" themeColor="text2">
          Credit available {formatMoney(total.creditAvailableMinor, { sign: 'none' })}
        </ThemedText>
      ) : null}
    </Card>
  );
}

export default function MyAccountsScreen() {
  const { data: accounts } = useAccounts();
  const views = useAccountViews(accounts ?? []);
  const openSheet = useSheetRegistry((s) => s.open);
  const [showArchived, setShowArchived] = useState(false);
  const [now] = useState(() => Date.now());

  const visible = views.filter((v) => showArchived || !v.account.archivedAt);
  const archivedCount = views.filter((v) => v.account.archivedAt).length;

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar
        title="My accounts"
        onBack={() => router.back()}
        right={{ icon: 'plus', label: 'Add account', onPress: () => openSheet('createAccount', {}) }}
      />

      <ScrollView contentContainerStyle={styles.body}>
        {views.length === 0 ? (
          <EmptyState
            glyph="landmark"
            line="Accounts appear here as your bank texts arrive — or add one yourself."
            cta={{ label: 'Add account', onPress: () => openSheet('createAccount', {}) }}
          />
        ) : (
          <>
            <TotalCard views={views} now={now} />
            <View style={styles.needs}>
              <NeedsALookCards views={views} />
            </View>
            {ACCOUNT_SECTIONS.map(({ kind, title }) => {
              const rows = visible.filter((v) => v.account.kind === kind);
              return (
                <View key={kind}>
                  <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
                    {title}
                  </ThemedText>
                  <View style={styles.section}>
                    {rows.map((view) => (
                      <AccountRow
                        key={view.account.id}
                        view={view}
                        now={now}
                        onPress={() => openSheet('editAccount', { accountId: view.account.id })}
                      />
                    ))}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${title.toLowerCase()}`}
                      onPress={() => openSheet('createAccount', { kind })}
                      style={[styles.addRow, rows.length === 0 ? null : styles.addRowDivider]}
                    >
                      <Icon name="plus" size={16} color="text3" />
                      <ThemedText type="label" themeColor="text2">
                        Add account
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
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
  total: { gap: Spacing.one },
  needs: { paddingTop: Spacing.two },
  sectionLabel: { paddingTop: Spacing.three, paddingBottom: Spacing.one },
  section: { borderRadius: 14, backgroundColor: Colors.dark.surface2, paddingHorizontal: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 64, paddingVertical: Spacing.two },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  name: { flexShrink: 1 },
  amountCol: { alignItems: 'flex-end', gap: 2 },
  pill: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: Radius.pill },
  pillNew: { backgroundColor: Colors.dark.primary },
  pillWarn: { backgroundColor: Colors.dark.warn },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 48 },
  addRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.dark.hairline },
  archivedToggle: { alignItems: 'center', paddingVertical: Spacing.four },
});
