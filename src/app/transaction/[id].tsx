/**
 * Transaction Details — SPEC-UI-UX.md §6.8, SPEC-implementation.md §30.10. Part of F5 ("Open a
 * row → Details").
 *
 * Edit (bottom-anchored primary button) opens the Edit sheet (§6.6), pre-filled from this row.
 * The Uncategorized "Set category" control (meta row) also opens the Edit sheet rather than a
 * standalone one-tap category picker — same underlying capability, documented simplification (no
 * separate write path outside the normal draft/sheet system for what's otherwise a one-off).
 *
 * Deferred for this pass (documented, not silent — see `SPEC/traceability.md`):
 *  - Overflow is a direct-tap Delete icon, not a dropdown menu — there's only one overflow
 *    action right now, same simplification as Review Queue's card overflow.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { getCategoryMap } from '@/db/repositories/categories';
import { softDeleteTransaction, useTransaction } from '@/db/repositories/transactions';
import type { PaymentMethod } from '@/db/schema';
import { formatMoney } from '@/domain/format/money';
import { useSheetRegistry } from '@/stores';
import { useUndo } from '@/stores/undo';

import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  wallet: 'Wallet',
};

export default function TransactionDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useTransaction(id);
  const txn = data?.[0] ?? null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!txn) {
    return (
      <SafeAreaView style={styles.screen}>
        <TopBar title="Transaction" onBack={() => router.back()} />
      </SafeAreaView>
    );
  }

  const category = txn.categoryId ? (getCategoryMap().get(txn.categoryId) ?? null) : null;
  const signedMinor = txn.direction === 'credit' ? txn.amountMinor : -txn.amountMinor;

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    softDeleteTransaction(txn.id);
    router.back();
    useUndo.getState().show(txn.id);
  };

  const openEdit = () => useSheetRegistry.getState().open('edit', { transactionId: txn.id });
  const isUncategorized = txn.type !== 'income' && !category;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backTap}>
          <Icon name="arrow-left" />
        </Pressable>
        <View style={styles.headerSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          onPress={() => setShowDeleteConfirm(true)}
          style={styles.overflowTap}
        >
          <Icon name="trash-2" color="text3" />
        </Pressable>
      </View>

      <View style={styles.content}>
        <ThemedText type="amountHero" style={styles.amount}>
          {formatMoney(signedMinor)}
        </ThemedText>

        <View style={styles.metaRow}>
          <ThemedText type="label" themeColor="text3">
            {txn.direction === 'credit' ? 'Income' : 'Expense'}
          </ThemedText>
          <ThemedText type="label" themeColor="text3">
            ·
          </ThemedText>
          {isUncategorized ? (
            <Pressable accessibilityRole="button" onPress={openEdit} style={styles.setCategoryTap}>
              <ThemedText type="label" themeColor="text" style={styles.setCategoryLabel}>
                Set category
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="label" themeColor="text3">
              {txn.type === 'income' ? 'Income' : (category?.name ?? 'Uncategorized')}
            </ThemedText>
          )}
          {txn.paymentMethod ? (
            <>
              <ThemedText type="label" themeColor="text3">
                ·
              </ThemedText>
              <ThemedText type="label" themeColor="text3">
                {PAYMENT_METHOD_LABEL[txn.paymentMethod]}
              </ThemedText>
            </>
          ) : null}
        </View>

        <ThemedText type="title" style={styles.field}>
          {txn.note?.trim() || 'Add a note'}
        </ThemedText>

        {txn.account ? (
          <DetailRow label="Account" value={txn.account} />
        ) : null}
        <DetailRow label="Date & time" value={format(new Date(txn.occurredAt), 'd MMM yyyy · h:mm a')} />
        {txn.description ? <DetailRow label="Description" value={txn.description} /> : null}

        {txn.source === 'sms' ? (
          <View style={styles.provenance}>
            <Icon name="shield-check" size={14} color="text3" />
            <ThemedText type="caption" themeColor="text3">
              Detected automatically · {format(new Date(txn.occurredAt), 'd MMM')}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button onPress={openEdit} style={styles.editButton}>
          Edit
        </Button>
      </View>

      <ConfirmDialog
        visible={showDeleteConfirm}
        glyph="trash-2"
        title="Delete transaction?"
        body="You can undo this for a few seconds after."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="label" themeColor="text3">
        {label}
      </ThemedText>
      <ThemedText type="body" themeColor="text">
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  headerSpacer: { flex: 1 },
  backTap: { width: 44, height: 44, marginLeft: -Spacing.two, alignItems: 'center', justifyContent: 'center' },
  overflowTap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.two },
  amount: { textAlign: 'center', marginBottom: Spacing.two },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.four,
  },
  field: { marginBottom: Spacing.two },
  detailRow: { gap: 2, marginBottom: Spacing.two },
  provenance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  setCategoryTap: { paddingVertical: 2 },
  setCategoryLabel: { textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  editButton: { width: '100%' },
});
