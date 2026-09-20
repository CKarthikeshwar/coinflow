/**
 * `TransactionCard` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Icon tile (inverts for
 * income) + label (note → account → "No note") + category-only meta + signed amount.
 * Uncategorized = "?" tile + dashed-underline word (V-4).
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Category, Transaction } from '@/db/schema';
import { formatMoney, formatRupees } from '@/domain/format/money';
import { formatWhen } from '@/domain/format/when';
import { splitBadgeLabel, type SplitBadge } from '@/domain/split-badge';

import { Card } from './card';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export type TransactionCardProps = {
  txn: Transaction;
  category: Category | null;
  showTime?: boolean;
  /** V2 (UI-075): set when this transaction is shared — adds the "Split · 1 of 3 paid" line and "Your share". */
  split?: SplitBadge;
  onPress: () => void;
};

export function TransactionCard({ txn, category, showTime = false, split, onPress }: TransactionCardProps) {
  const isIncome = txn.type === 'income';
  const isUncategorized = !isIncome && category === null;
  const iconName: IconName = isIncome ? 'arrow-down-to-line' : isUncategorized ? 'help-circle' : ((category?.icon ?? 'shapes') as IconName);

  const label = txn.note?.trim() || txn.account?.trim() || 'No note';
  const categoryLabel = isIncome ? 'Income' : (category?.name ?? 'Uncategorized');

  const signedMinor = txn.direction === 'credit' ? txn.amountMinor : -txn.amountMinor;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card padding={Spacing.three} style={styles.card}>
        <View style={[styles.tile, isIncome ? styles.tileInverted : null]}>
          <Icon name={iconName} size={20} color={isIncome ? 'primaryInk' : 'text'} />
        </View>
        <View style={styles.textCol}>
          <ThemedText type="body" themeColor="text" numberOfLines={1}>
            {label}
          </ThemedText>
          <ThemedText
            type="label"
            themeColor="text3"
            style={isUncategorized ? styles.uncategorized : undefined}
          >
            {categoryLabel}
            {showTime ? ` · ${formatWhen(txn.occurredAt)}` : ''}
          </ThemedText>
          {split ? (
            <View style={styles.splitLine}>
              <Icon name="users" size={12} color="text3" />
              <ThemedText type="caption" themeColor="text3">
                {splitBadgeLabel(split)}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.amountCol}>
          <ThemedText type="body" themeColor="text">
            {formatMoney(signedMinor)}
          </ThemedText>
          {split ? (
            <ThemedText type="caption" themeColor="text3">
              Your share {formatRupees(split.yourMinor)}
            </ThemedText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: {
    width: 42,
    height: 42,
    borderRadius: Radius.iconTile,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileInverted: { backgroundColor: Colors.dark.primary },
  textCol: { flex: 1, gap: 2 },
  amountCol: { alignItems: 'flex-end', gap: 2 },
  splitLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  uncategorized: { textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
});
