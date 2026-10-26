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
  /** CR-34 (UI-109) — which of your accounts ("HDFC ··672"), added to the meta line. */
  accountLabel?: string;
  /** CR-34 (UI-106) — a transfer's "SBI ··1234 → HDFC ··672"; the row then reads neutral (no +/−). */
  transferLabel?: string;
  onPress: () => void;
};

export function TransactionCard({
  txn,
  category,
  showTime = false,
  split,
  accountLabel,
  transferLabel,
  onPress,
}: TransactionCardProps) {
  const isIncome = txn.type === 'income';
  const isTransfer = txn.type === 'transfer';
  // CR-28: income can be categorized too. The tile stays inverted for income; it shows the category's icon, or the
  // plain income arrow while uncategorized (expenses show "?" instead).
  const isUncategorized = category === null;
  const iconName: IconName = isTransfer
    ? 'arrow-left-right'
    : category
      ? (category.icon as IconName)
      : isIncome
        ? 'arrow-down-to-line'
        : 'help-circle';

  const note = txn.note?.trim();
  const label = isTransfer ? (transferLabel ?? 'Transfer') : note || txn.account?.trim() || 'No note';
  const categoryLabel = isTransfer ? (note ? `Transfer · ${note}` : 'Transfer') : (category?.name ?? 'Uncategorized');
  const metaAccount = !isTransfer && accountLabel ? ` · ${accountLabel}` : '';

  const signedMinor = txn.direction === 'credit' ? txn.amountMinor : -txn.amountMinor;
  const amountText = isTransfer ? formatMoney(txn.amountMinor, { sign: 'none' }) : formatMoney(signedMinor);

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
            style={isUncategorized && !isTransfer ? styles.uncategorized : undefined}
            numberOfLines={1}
          >
            {categoryLabel}
            {metaAccount}
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
          <ThemedText type="body" themeColor={isTransfer ? 'text2' : 'text'}>
            {amountText}
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
