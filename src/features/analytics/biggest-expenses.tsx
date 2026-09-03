/**
 * `BiggestExpenses` — SPEC-UI-UX.md §6.10 item 6, SPEC-implementation.md §26.5/§29.4. F9. Top
 * ~5 individual expenses this period → Details. Reuses `TransactionCard` as-is (label · category
 * · relative time · amount) rather than a new row shape — `showTime` already covers the spec's
 * "date" column.
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Category, Transaction } from '@/db/schema';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';
import { TransactionCard } from '@/ui/transaction-card';

export type BiggestExpensesProps = { rows: Transaction[]; categoryById: Map<string, Category> };

export function BiggestExpenses({ rows, categoryById }: BiggestExpensesProps) {
  if (rows.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <ThemedText type="label" themeColor="text3">
          Biggest expenses
        </ThemedText>
        <ThemedText type="body" themeColor="text3" style={styles.empty}>
          Nothing recorded for this period.
        </ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="label" themeColor="text3">
        Biggest expenses
      </ThemedText>
      {rows.map((txn) => (
        <TransactionCard
          key={txn.id}
          txn={txn}
          category={txn.categoryId ? (categoryById.get(txn.categoryId) ?? null) : null}
          showTime
          onPress={() => router.push(`/transaction/${txn.id}`)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  emptyCard: { gap: Spacing.two },
  empty: { paddingVertical: Spacing.three, textAlign: 'center' },
});
