/**
 * `AccountBreakdown` — SPEC-UI-UX.md §6.10 (CR-27). "By account": one row per account with the period's spend and
 * income and a bar, plus a "No account" row for cash and entries not linked to an account. Tapping a row filters the
 * whole page to that account (tapping it again clears the filter). While the page is filtered, the accounts outside
 * the filter are dimmed with "Not in this view" and "—".
 *
 * Left out when there is only one row: with a single account there is nothing to compare.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { MyAccount } from '@/db/schema';
import { NO_ACCOUNT_ID } from '@/domain/analytics-filter';
import { formatMoney } from '@/domain/format/money';

import { Card } from '@/ui/card';
import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export type AccountTotal = { accountId: string | null; spentMinor: number; incomeMinor: number };

export type AccountBreakdownProps = {
  accounts: MyAccount[];
  totals: AccountTotal[];
  /** The account filter; empty = all accounts. */
  selectedIds: string[];
  /** Called with the account id, or {@link NO_ACCOUNT_ID}. */
  onSelect: (id: string) => void;
};

const KIND_ICON: Record<string, IconName> = {
  bank: 'landmark',
  credit_card: 'credit-card',
  wallet: 'wallet',
  cash: 'banknote',
};

const KIND_LABEL: Record<string, string> = {
  bank: 'Bank account',
  credit_card: 'Credit card',
  wallet: 'Wallet',
  cash: 'Cash',
};

type Row = { id: string; name: string; sub: string; icon: IconName; spentMinor: number; incomeMinor: number };

export function AccountBreakdown({ accounts, totals, selectedIds, onSelect }: AccountBreakdownProps) {
  const byAccount = new Map(totals.map((t) => [t.accountId ?? NO_ACCOUNT_ID, t]));

  const rows: Row[] = accounts
    .filter((a) => !a.archivedAt || byAccount.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.nickname,
      sub: KIND_LABEL[a.kind] ?? 'Account',
      icon: KIND_ICON[a.kind] ?? 'landmark',
      spentMinor: byAccount.get(a.id)?.spentMinor ?? 0,
      incomeMinor: byAccount.get(a.id)?.incomeMinor ?? 0,
    }));
  const none = byAccount.get(NO_ACCOUNT_ID);
  if (none || selectedIds.includes(NO_ACCOUNT_ID)) {
    rows.push({
      id: NO_ACCOUNT_ID,
      name: 'No account',
      sub: 'Cash and entries not linked',
      icon: 'wallet',
      spentMinor: none?.spentMinor ?? 0,
      incomeMinor: none?.incomeMinor ?? 0,
    });
  }

  if (rows.length < 2) return null;

  const filtered = selectedIds.length > 0;
  const maxSpent = Math.max(1, ...rows.map((r) => r.spentMinor));

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="label" themeColor="text3">
          By account
        </ThemedText>
        <ThemedText type="caption" themeColor="text3">
          Tap one to filter the page
        </ThemedText>
      </View>
      {rows.map((row) => {
        const selected = selectedIds.includes(row.id);
        const outside = filtered && !selected;
        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.name}
            accessibilityState={{ selected }}
            onPress={() => onSelect(row.id)}
            style={[styles.row, selected ? styles.rowSelected : null, outside ? styles.rowOutside : null]}
          >
            <View style={styles.tile}>
              <Icon name={row.icon} size={18} color="text" />
            </View>
            <View style={styles.name}>
              <ThemedText type="body" themeColor="text" numberOfLines={1}>
                {row.name}
              </ThemedText>
              <ThemedText type="caption" themeColor="text3" numberOfLines={1}>
                {outside ? 'Not in this view' : selected ? 'Selected' : row.sub}
              </ThemedText>
            </View>
            <View style={styles.figures}>
              <ThemedText type="body" themeColor="text">
                {outside ? '—' : formatMoney(-row.spentMinor, { sign: 'always' })}
              </ThemedText>
              <ThemedText type="caption" themeColor="text3">
                {outside ? '—' : formatMoney(row.incomeMinor, { sign: 'always' })}
              </ThemedText>
            </View>
            <View style={styles.barTrack}>
              {!outside ? <View style={[styles.barFill, { width: `${Math.round((100 * row.spentMinor) / maxSpent)}%` }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.control + 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: { backgroundColor: Colors.dark.surface2, borderColor: Colors.dark.text3 },
  rowOutside: { opacity: 0.5 },
  tile: {
    width: 34,
    height: 34,
    borderRadius: Radius.iconTile - 1,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, gap: 1 },
  figures: { alignItems: 'flex-end', gap: 1 },
  barTrack: { width: '100%', height: 4, borderRadius: Radius.pill, backgroundColor: Colors.dark.surface3, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: Radius.pill, backgroundColor: Colors.dark.text },
});
