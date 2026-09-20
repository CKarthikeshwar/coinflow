/**
 * FILE PURPOSE
 * ------------
 * The full-detail view of one transaction — reached by tapping a row in the Transactions list,
 * Home's recent activity, or a "transaction" notification tap
 * (`src/services/notifications/deep-link.ts`). `[id]` in the filename means expo-router treats
 * this as a dynamic route — the transaction's id comes from the URL (`useLocalSearchParams`).
 *
 * Edit (bottom-anchored primary button) opens the Edit sheet (§6.6), pre-filled from this row.
 * The Uncategorized "Set category" control (meta row) also opens the Edit sheet rather than a
 * standalone one-tap category picker — same underlying capability, documented simplification (no
 * separate write path outside the normal draft/sheet system for what's otherwise a one-off).
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
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { getCategoryMap } from '@/db/repositories/categories';
import { useSettlementsForTransaction, useSplitForTransaction, useSplitsOverview } from '@/db/repositories/split-hooks';
import { unsettle } from '@/db/repositories/settlements';
import { removeSplit, unwaiveShare, waiveShare } from '@/db/repositories/splits';
import { softDeleteTransaction, useTransaction } from '@/db/repositories/transactions';
import type { PaymentMethod } from '@/db/schema';
import { formatMoney, formatRupees } from '@/domain/format/money';
import { isSmsCaptureSupported } from '@/services/sms';
import { openInSmsApp, sendRequests, summarizeReport } from '@/services/splits/send-requests';
import { useSheetRegistry } from '@/stores';
import { useToast } from '@/stores/toast';
import { useUndo } from '@/stores/undo';

import { settleAndAnnounce } from '@/features/splits/settle-and-announce';
import { SettlementsSection } from '@/features/splits/settlements-section';
import { SplitCard } from '@/features/splits/split-card';
import { SuggestedSettlementBanner, useSettlementSuggestion } from '@/features/splits/suggested-settlement-banner';

import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon } from '@/ui/icon';
import { SelectorRow } from '@/ui/selector-row';
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
  const [showRemoveSplit, setShowRemoveSplit] = useState(false);
  // V2 (CR-4): the split on this transaction, live — must be read before the early return below.
  const split = useSplitForTransaction(id);
  // V2 (CR-4, phase 4): what this transaction has settled, what is still open to settle, and the advisory match.
  const overview = useSplitsOverview();
  const settled = useSettlementsForTransaction(id);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [sendingShareId, setSendingShareId] = useState<string | null>(null);
  const canSendSms = isSmsCaptureSupported();
  const openShares = overview.owed.flatMap((g) => g.items);
  const availableMinor = txn ? txn.amountMinor - settled.allocatedMinor : 0;
  const suggestion = useSettlementSuggestion(openShares, {
    availableMinor,
    account: txn?.account,
    isCredit: txn?.direction === 'credit',
  });

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

  // V2 — only a debit can be split (CR-8). The Split sheet opens "direct": it saves straight to the database.
  const openSplit = () => useSheetRegistry.getState().open('split', { direct: true, transactionId: txn.id });
  const canMerge =
    availableMinor > 0 && (txn.direction === 'credit' ? overview.owed.length > 0 : overview.youOwe.length > 0);
  const openMerge = () => useSheetRegistry.getState().open('merge', { transactionId: txn.id });
  const settleSuggestion = () => {
    if (!suggestion) return;
    settleAndAnnounce(
      { transactionId: txn.id, picks: [{ shareId: suggestion.shareId }] },
      'share',
      new Map([[suggestion.shareId, suggestion.personName]]),
    );
  };
  // V2 phase 5 (§6.17) — send / retry / resend one person's request from the card. The split is already saved,
  // so a failure only leaves that share's request state as it was; the row then offers Retry.
  const sendOneRequest = async (shareId: string) => {
    if (!split) return;
    setSendingShareId(shareId);
    try {
      const report = await sendRequests(split.split.id, { shareIds: [shareId], force: true });
      if (report.fallback.length > 0) {
        // SEND_SMS refused: hand the pre-filled message to the user's own SMS app instead.
        const opened = await openInSmsApp(split.split.id, shareId);
        useToast.getState().show(opened?.state === 'opened_in_sms_app' ? 'Opened in Messages — press send there' : 'Could not open Messages');
      } else {
        useToast.getState().show(summarizeReport(report) ?? 'Nothing to send');
      }
    } catch {
      useToast.getState().show('Could not send the request');
    } finally {
      setSendingShareId(null);
    }
  };

  const removeSettlement = (settlementId: string) => {
    unsettle([settlementId]);
    useToast.getState().show('Settlement removed');
  };
  const owedMinor = split ? split.shares.reduce((a, s) => a + s.remainingMinor, 0) : 0;
  const handleRemoveSplit = () => {
    setShowRemoveSplit(false);
    if (!split) return;
    removeSplit(split.split.id);
    useToast.getState().show('Split removed');
  };

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ThemedText type="amountHero" style={styles.amount}>
          {formatMoney(signedMinor)}
        </ThemedText>
        {split ? (
          <ThemedText type="label" themeColor="text3" style={styles.shareLine}>
            Your share {formatRupees(split.effectiveMinor)}
            {owedMinor > 0 ? ` · ${formatRupees(owedMinor)} still owed` : ' · all settled'}
          </ThemedText>
        ) : null}

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

        {suggestion && !suggestionDismissed ? (
          <View style={styles.banner}>
            <SuggestedSettlementBanner
              personName={suggestion.personName}
              amountMinor={availableMinor}
              onSettle={settleSuggestion}
              onDismiss={() => setSuggestionDismissed(true)}
            />
          </View>
        ) : null}

        {canMerge ? (
          <View style={styles.splitRow}>
            <SelectorRow icon="users" label="Merge into a split…" onPress={openMerge} />
          </View>
        ) : null}

        {txn.direction === 'debit' && !split ? (
          <View style={styles.splitRow}>
            <SelectorRow icon="users" label="Split…" onPress={openSplit} />
          </View>
        ) : null}

        {split ? (
          <SplitCard
            view={split}
            onEditSplit={openSplit}
            onRemoveSplit={() => setShowRemoveSplit(true)}
            onWaive={(shareId) => waiveShare(shareId)}
            onRestore={(shareId) => unwaiveShare(shareId)}
            onSendRequest={canSendSms ? sendOneRequest : undefined}
            sendingShareId={sendingShareId}
          />
        ) : null}

        <SettlementsSection
          lines={settled.lines}
          unallocatedMinor={availableMinor}
          onRemove={removeSettlement}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button onPress={openEdit} style={styles.editButton}>
          Edit
        </Button>
      </View>

      <ConfirmDialog
        visible={showRemoveSplit}
        glyph="trash-2"
        title="Remove split?"
        body="Each person’s share and any payments recorded against them are removed. The payments themselves stay as transactions."
        confirmLabel="Remove"
        onConfirm={handleRemoveSplit}
        onCancel={() => setShowRemoveSplit(false)}
      />
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
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.two },
  splitRow: { marginHorizontal: -Spacing.three }, // SelectorRow pads its own sides; line it up with the text above
  banner: { marginTop: Spacing.two },
  shareLine: { textAlign: 'center', marginTop: -Spacing.one },
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
