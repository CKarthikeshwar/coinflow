/**
 * Transaction Confirmation (F3, §6.4/§30.6) and Add Transaction (F4, §6.5/§30.7) sheets. One
 * component, mode-aware — the two screens share every field, the keypad, the write path, and
 * the discard-guard; they only differ in how the draft is seeded and how the amount gate
 * behaves on submit. Kept as one file rather than duplicating ~200 lines across two.
 *
 * Deferred for both (documented, not silent — see `SPEC/traceability.md`):
 *  - Date & time is shown, not editable — no date/time picker built yet.
 *  - Account is a plain text field, not the "matching past accounts" autocomplete
 *    (`searchByPrefix` exists in the repo but isn't wired to a dropdown here).
 *  - The amount block doesn't collapse to a sticky summary bar on scroll, and the numeric
 *    keypad doesn't swap for the OS keyboard when a text field is focused — both stay docked;
 *    text fields simply also raise the OS keyboard on top when focused.
 *  - Payment method is a `SegmentedControl` row rather than its own picker sheet.
 *  - No success toast — the sheet just closes (§30.7 mentions a toast; `ui/toast.tsx` isn't
 *    built yet).
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { getAccountRule } from '@/db/repositories/account-rules';
import { useCategories } from '@/db/repositories/categories';
import { getSuggestion } from '@/db/repositories/suggestions';
import { resolveCategoryForAccount } from '@/domain/categorize';
import { useAddSheetDraft, useKeypad, useSheetRegistry } from '@/stores';
import type { KeypadKey } from '@/stores/keypad';

import { AmountInput } from '@/ui/amount-input';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon } from '@/ui/icon';
import { NumericKeypad } from '@/ui/numeric-keypad';
import { SegmentedControl } from '@/ui/segmented-control';
import { SelectorRow } from '@/ui/selector-row';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

import { writeConfirmedTransaction, type SmsRef } from './write-confirmed-transaction';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
] as const;

/** ₹10,00,000 in paise — §6.4 edge threshold (Confirm mode only; Add just disables the button). */
const MAX_SANE_AMOUNT_MINOR = 10_00_000_00;

const HEADER_TITLE = { confirm: 'Review transaction', add: 'Add transaction' } as const;

export type TransactionSheetMode = 'confirm' | 'add';

export function TransactionSheetBody({ mode }: { mode: TransactionSheetMode }) {
  const params = useSheetRegistry((s) => s.params) as { suggestionId?: string };
  const suggestionId = params.suggestionId;
  const close = useSheetRegistry((s) => s.close);
  const open = useSheetRegistry((s) => s.open);

  const draft = useAddSheetDraft();
  const { data: categories } = useCategories();

  // Not rendered — only read at submit time — so a ref, not state (also avoids a synchronous
  // setState-in-effect below).
  const smsRefRef = useRef<SmsRef>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showEdgeAmountConfirm, setShowEdgeAmountConfirm] = useState(false);

  useEffect(() => {
    if (mode === 'add') {
      useAddSheetDraft.getState().open({
        mode: 'add',
        amountMinor: 0,
        direction: 'debit',
        type: 'expense',
        categoryId: null,
        paymentMethod: 'upi',
        account: '',
        note: '',
        description: '',
        occurredAt: Date.now(),
      });
      useKeypad.getState().reset();
      smsRefRef.current = null;
      return;
    }

    if (!suggestionId) return;
    const suggestion = getSuggestion(suggestionId);
    if (!suggestion) {
      close();
      return;
    }
    const rule = suggestion.normalizedKey ? getAccountRule(suggestion.normalizedKey) : null;
    const resolved = resolveCategoryForAccount(rule);
    const direction = suggestion.direction ?? 'debit';
    const amountMinor = suggestion.amountMinor ?? 0;

    useAddSheetDraft.getState().open({
      mode: 'confirm',
      sourceId: suggestionId,
      amountMinor,
      direction,
      type: direction === 'credit' ? 'income' : 'expense',
      categoryId: resolved.categoryId,
      paymentMethod: resolved.paymentMethod ?? suggestion.paymentMethod,
      account: suggestion.account ?? '',
      note: resolved.note ?? '',
      description: '',
      occurredAt: suggestion.occurredAt ?? Date.now(),
    });
    useKeypad.getState().setFromMinor(amountMinor);
    smsRefRef.current = {
      sender: suggestion.smsSender,
      receivedAt: suggestion.smsReceivedAt,
      dedupeKey: suggestion.dedupeKey,
    };
  }, [mode, suggestionId, close]);

  const handleKey = (key: KeypadKey) => {
    useKeypad.getState().press(key);
    draft.patch({ amountMinor: useKeypad.getState().amountMinor });
  };

  const categoryName =
    draft.categoryId === null
      ? 'Uncategorized'
      : (categories ?? []).find((c) => c.id === draft.categoryId)?.name ?? 'Uncategorized';

  const isEdgeAmount = draft.amountMinor === 0 || draft.amountMinor > MAX_SANE_AMOUNT_MINOR;
  const addDisabled = mode === 'add' && draft.amountMinor <= 0;

  const handleCancel = () => {
    if (draft.dirty) setShowDiscardConfirm(true);
    else close();
  };

  const doDiscard = () => {
    setShowDiscardConfirm(false);
    draft.reset();
    close();
  };

  const submit = () => {
    draft.setSubmitting(true);
    try {
      writeConfirmedTransaction(useAddSheetDraft.getState(), smsRefRef.current);
      draft.reset();
      close();
    } catch {
      draft.setSubmitting(false);
      draft.setError('Could not save. Try again.');
    }
  };

  const handleAdd = () => {
    if (addDisabled) return;
    // The §6.4 "unusual amount" warn-then-allow gate is Confirm-specific — Add's own gate is
    // simply staying disabled until amount > 0 (§6.5), no extra dialog.
    if (mode === 'confirm' && isEdgeAmount) {
      setShowEdgeAmountConfirm(true);
      return;
    }
    submit();
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>
          {HEADER_TITLE[mode]}
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={handleCancel}>
          <ThemedText type="label" themeColor="text2">
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <AmountInput
          amountMinor={draft.amountMinor}
          mode="full"
          helper={
            mode === 'confirm' && isEdgeAmount
              ? draft.amountMinor === 0
                ? 'Amount is ₹0'
                : "That's a large amount"
              : mode === 'add' && draft.amountMinor === 0
                ? 'Enter an amount'
                : undefined
          }
        />

        <SegmentedControl
          options={[
            { value: 'debit', label: 'Expense' },
            { value: 'credit', label: 'Income' },
          ]}
          value={draft.direction}
          onChange={(direction) =>
            draft.patch({ direction, type: direction === 'credit' ? 'income' : 'expense' })
          }
        />

        {draft.type !== 'income' ? (
          <SelectorRow
            icon="tag"
            label="Category"
            value={categoryName}
            onPress={() => open('categoryPicker', params)}
          />
        ) : null}

        <View style={styles.methodBlock}>
          <ThemedText type="label" themeColor="text3">
            Payment method
          </ThemedText>
          <SegmentedControl
            options={PAYMENT_METHOD_OPTIONS}
            value={draft.paymentMethod ?? 'upi'}
            onChange={(paymentMethod) => draft.patch({ paymentMethod })}
          />
        </View>

        <View style={styles.staticRow}>
          <Icon name="calendar" size={18} color="text3" />
          <ThemedText type="body" themeColor="text" style={styles.staticLabel}>
            Date & time
          </ThemedText>
          <ThemedText type="body" themeColor="text3">
            {format(new Date(draft.occurredAt), 'd MMM · h:mm a')}
          </ThemedText>
        </View>

        <TextField value={draft.account} onChangeText={(account) => draft.patch({ account })} placeholder="Account" />
        <TextField value={draft.note} onChangeText={(note) => draft.patch({ note })} placeholder="Note" />
        <TextField
          value={draft.description}
          onChangeText={(description) => draft.patch({ description })}
          placeholder="Description (optional)"
          multiline
        />

        {draft.error ? (
          <ThemedText type="label" themeColor="text" style={styles.error}>
            {draft.error}
          </ThemedText>
        ) : null}
      </BottomSheetScrollView>

      <NumericKeypad onKey={handleKey} />
      <View style={styles.primaryRow}>
        <Button
          variant={addDisabled ? 'disabled' : 'primary'}
          onPress={handleAdd}
          loading={draft.submitting}
          style={styles.primaryButton}
        >
          Add
        </Button>
      </View>

      <ConfirmDialog
        visible={showDiscardConfirm}
        glyph="triangle-alert"
        title="Discard changes?"
        body="Your edits won't be saved."
        confirmLabel="Discard"
        onConfirm={doDiscard}
        onCancel={() => setShowDiscardConfirm(false)}
      />
      <ConfirmDialog
        visible={showEdgeAmountConfirm}
        glyph="triangle-alert"
        title="Unusual amount"
        body={draft.amountMinor === 0 ? 'This transaction is ₹0. Add anyway?' : 'This is a large amount. Add anyway?'}
        confirmLabel="Add anyway"
        onConfirm={() => {
          setShowEdgeAmountConfirm(false);
          submit();
        }}
        onCancel={() => setShowEdgeAmountConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.four },
  methodBlock: { gap: Spacing.one },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  staticLabel: { flex: 1 },
  error: { paddingHorizontal: Spacing.one },
  primaryRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  primaryButton: { width: '100%' },
});
