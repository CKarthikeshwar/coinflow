/**
 * FILE PURPOSE
 * ------------
 * The single form used for THREE different jobs: confirming an SMS-detected suggestion, adding
 * a brand-new manual transaction, and editing an existing one. `mode` (`'confirm' | 'add' |
 * 'edit'`) picks which of the three it's acting as. This is one of the most important, most
 * frequently-used screens in the whole app — nearly every transaction that ends up in the
 * database passes through here at some point.
 *
 * WHERE IT FITS
 * -------------
 * Rendered by `src/features/app-shell/sheet-host.tsx` whenever `useSheetRegistry`'s `current` is
 * `'confirm'`, `'add'`, or `'edit'`. Reads/writes its in-progress values through
 * `src/stores/add-sheet-draft.ts` (the form state) and `src/stores/keypad.ts` (the amount).
 * When the user hits the primary button, it hands off to `write-confirmed-transaction.ts` in
 * this same folder, which does the actual database write.
 *
 * DATA FLOW
 * ---------
 *   sheet opens (mode + optional suggestionId/transactionId in useSheetRegistry's params)
 *     ↓
 *   draft is seeded: blank (add), from a Suggestion row (confirm), or from a Transaction row (edit)
 *     ↓
 *   user edits fields — every change goes through useAddSheetDraft's patch()
 *     ↓
 *   user taps Add/Save → write-confirmed-transaction.ts writes to the database
 *     ↓
 *   sheet closes, a toast confirms the save, the screen behind it re-renders live (useLiveQuery)
 *
 * IMPORTANT
 * ---------
 * The three modes are kept in ONE component rather than three separate ones because they share
 * essentially everything — every field, the keypad, the write path, the discard-guard — and only
 * differ in how the draft is seeded and how strictly the amount is validated on submit. Splitting
 * them would mean keeping ~200 lines of near-duplicate logic in sync across three files.
 *
 * Date & time is editable via two plain `yyyy-MM-dd`/`HH:mm` text fields revealed on tap, not a
 * calendar/clock picker — same simplification as the Filter sheet's custom date range (no
 * calendar component exists yet, and no native date-picker package is installed).
 *
 * Account autocomplete (`searchByPrefix`) shows past accounts as you type; picking one pre-fills
 * its remembered category (§6.5) — not note/payment method, which is F8's broader "known-rule"
 * pre-fill on a *detected* suggestion (a different trigger from typing here).
 *
 * Deferred for both (documented, not silent — see `SPEC/traceability.md`):
 *  - The amount block doesn't collapse to a sticky summary bar on scroll, and the numeric
 *    keypad doesn't swap for the OS keyboard when a text field is focused — both stay docked;
 *    text fields simply also raise the OS keyboard on top when focused.
 *  - Payment method is a `SegmentedControl` row rather than its own picker sheet.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { format, parse } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { getAccountRule, searchByPrefix } from '@/db/repositories/account-rules';
import { useCategories } from '@/db/repositories/categories';
import { getSuggestion } from '@/db/repositories/suggestions';
import { getTransaction } from '@/db/repositories/transactions';
import type { AccountRule } from '@/db/schema';
import { resolveCategoryForAccount } from '@/domain/categorize';
import { formatMoney } from '@/domain/format/money';
import { useAddSheetDraft, useKeypad, useSheetRegistry } from '@/stores';
import type { KeypadKey } from '@/stores/keypad';
import { useToast } from '@/stores/toast';

import { AmountInput } from '@/ui/amount-input';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon } from '@/ui/icon';
import { NumericKeypad } from '@/ui/numeric-keypad';
import { SegmentedControl } from '@/ui/segmented-control';
import { SelectorRow } from '@/ui/selector-row';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

import { writeConfirmedTransaction, writeEditedTransaction, type SmsRef } from './write-confirmed-transaction';

const DATE_FMT = 'yyyy-MM-dd';
const TIME_FMT = 'HH:mm';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
] as const;

/** ₹10,00,000 in paise — §6.4 edge threshold (Confirm mode only; Add just disables the button). */
const MAX_SANE_AMOUNT_MINOR = 10_00_000_00;

const HEADER_TITLE = {
  confirm: 'Review transaction',
  add: 'Add transaction',
  edit: 'Edit transaction',
} as const;

const PRIMARY_LABEL = { confirm: 'Add', add: 'Add', edit: 'Save' } as const;

export type TransactionSheetMode = 'confirm' | 'add' | 'edit';

export function TransactionSheetBody({ mode }: { mode: TransactionSheetMode }) {
  const params = useSheetRegistry((s) => s.params) as {
    suggestionId?: string;
    transactionId?: string;
  };
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

  // Account autocomplete (§6.5) — `pickedAccount` tracks the last value chosen from the list so
  // it doesn't immediately reopen showing the same one-item match right after a pick; typing
  // again (a real edit) clears it.
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const accountSuggestions: AccountRule[] =
    draft.account.trim() && draft.account !== pickedAccount ? searchByPrefix(draft.account) : [];

  // Date & time editing — closed by default; opens to two text fields seeded from the current
  // `occurredAt` when tapped.
  const [editingDate, setEditingDate] = useState(false);
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');
  // `Date.now()` can't be called inline during render (React Compiler purity rule) — a lazy
  // `useState` initializer is the sanctioned one-time-impure-read escape hatch, so "now" here
  // means "whenever this sheet instance was mounted," stable for its lifetime. Good enough for
  // an edge-case helper that doesn't need to react to the clock ticking while the sheet is open.
  const [openedAtMs] = useState(() => Date.now());
  const isFutureDate = draft.occurredAt > openedAtMs;

  useEffect(() => {
    if (mode === 'add') {
      // Only seed a blank draft for a genuinely new Add session — SheetHost fully unmounts and
      // remounts this component whenever `current` swaps away to a sub-picker (Category, at
      // minimum) and back, so this effect re-runs on that return trip too, not just on a real
      // fresh open. `active` (add-sheet-draft.ts) is what tells the two apart: without this
      // guard, picking a category silently wiped whatever amount/fields the user had already
      // entered (found via a Maestro E2E run, `e2e/j4-manual-add.yaml`, 2026-09-04). The keypad
      // reset is gated the same way — it holds its own separate digit buffer that must stay in
      // sync with the (now preserved) draft, not get wiped out from under it.
      if (!useAddSheetDraft.getState().active) {
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
      }
      smsRefRef.current = null;
      return;
    }

    if (mode === 'edit') {
      const transactionId = params.transactionId;
      if (!transactionId) return;
      // Same "returning from a sub-picker shouldn't discard in-progress edits" guard as 'add'
      // above — re-seeding here re-reads the *original, on-disk* transaction, which would
      // silently throw away anything the user had already changed. Only re-fetch when this is
      // genuinely a new edit session (inactive, or a different transaction than the one already
      // being edited) — same source, still active, means preserve what's there.
      const draftNow = useAddSheetDraft.getState();
      if (draftNow.active && draftNow.sourceId === transactionId) {
        smsRefRef.current = null;
        return;
      }
      const txn = getTransaction(transactionId);
      if (!txn) {
        close();
        return;
      }
      useAddSheetDraft.getState().open({
        mode: 'edit',
        sourceId: txn.id,
        amountMinor: txn.amountMinor,
        direction: txn.direction,
        type: txn.type,
        categoryId: txn.categoryId,
        paymentMethod: txn.paymentMethod,
        account: txn.account ?? '',
        note: txn.note ?? '',
        description: txn.description ?? '',
        occurredAt: txn.occurredAt,
      });
      useKeypad.getState().setFromMinor(txn.amountMinor);
      smsRefRef.current = null;
      return;
    }

    if (!suggestionId) return;
    // Same guard again for Confirm — returning from Category shouldn't re-seed from the original
    // Suggestion and discard whatever the user already edited in this confirm session.
    const draftNow = useAddSheetDraft.getState();
    if (draftNow.active && draftNow.sourceId === suggestionId) {
      return;
    }
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
  }, [mode, suggestionId, params.transactionId, close]);

  const handleKey = (key: KeypadKey) => {
    useKeypad.getState().press(key);
    draft.patch({ amountMinor: useKeypad.getState().amountMinor });
  };

  const pickAccountSuggestion = (rule: AccountRule) => {
    setPickedAccount(rule.displayAccount);
    draft.patch({ account: rule.displayAccount, categoryId: rule.categoryId });
  };

  const openDateEdit = () => {
    setDateText(format(draft.occurredAt, DATE_FMT));
    setTimeText(format(draft.occurredAt, TIME_FMT));
    setEditingDate(true);
  };

  const applyDateTime = (nextDateText: string, nextTimeText: string) => {
    const parsed = parse(`${nextDateText} ${nextTimeText}`, `${DATE_FMT} ${TIME_FMT}`, new Date());
    if (!Number.isNaN(parsed.getTime())) draft.patch({ occurredAt: parsed.getTime() });
  };

  const categoryName =
    draft.categoryId === null
      ? 'Uncategorized'
      : (categories ?? []).find((c) => c.id === draft.categoryId)?.name ?? 'Uncategorized';

  const isEdgeAmount = draft.amountMinor === 0 || draft.amountMinor > MAX_SANE_AMOUNT_MINOR;
  // Confirm allows ₹0 through its own edge-amount extra-confirm gate below; Add and Edit both
  // just stay disabled until there's a real amount (§6.5/§6.6 — Edit is "identical to Add").
  const addDisabled = mode !== 'confirm' && draft.amountMinor <= 0;

  const handleCancel = useCallback(() => {
    if (draft.dirty) setShowDiscardConfirm(true);
    else close();
  }, [draft.dirty, close]);

  // Registers this sheet's own Cancel logic (dirty-check + discard confirm, V-6) as the
  // handler `useSheetRegistry().requestClose()` invokes — so the hardware/gesture back button
  // (SheetHost) gets the exact same guard the Cancel button does, not a bypass of it.
  useEffect(() => {
    useSheetRegistry.getState().setOnRequestClose(handleCancel);
    return () => useSheetRegistry.getState().setOnRequestClose(null);
  }, [handleCancel]);

  const doDiscard = () => {
    setShowDiscardConfirm(false);
    draft.reset();
    close();
  };

  const submit = () => {
    draft.setSubmitting(true);
    try {
      const current = useAddSheetDraft.getState();
      if (mode === 'edit') {
        writeEditedTransaction(current);
      } else {
        // §30.6/§30.7 — Add/Confirm's save toast; Edit's own spec (§30.8) doesn't have one.
        const { transactionId } = writeConfirmedTransaction(current, smsRefRef.current);
        const signedMinor = current.direction === 'credit' ? current.amountMinor : -current.amountMinor;
        useToast.getState().show(`Added ${formatMoney(signedMinor)}`, {
          label: 'View',
          onPress: () => router.push(`/transaction/${transactionId}`),
        });
      }
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
              : mode !== 'confirm' && draft.amountMinor === 0
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
            onPress={() => open('categoryPicker', { ...params, returnTo: mode })}
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

        <Pressable accessibilityRole="button" onPress={editingDate ? () => setEditingDate(false) : openDateEdit}>
          <View style={styles.staticRow}>
            <Icon name="calendar" size={18} color="text3" />
            <ThemedText type="body" themeColor="text" style={styles.staticLabel}>
              Date & time
            </ThemedText>
            <ThemedText type="body" themeColor="text3">
              {format(new Date(draft.occurredAt), 'd MMM · h:mm a')}
            </ThemedText>
          </View>
        </Pressable>
        {editingDate ? (
          <View style={styles.dateEditRow}>
            <TextField
              value={dateText}
              onChangeText={(t) => {
                setDateText(t);
                applyDateTime(t, timeText);
              }}
              placeholder="yyyy-mm-dd"
            />
            <TextField
              value={timeText}
              onChangeText={(t) => {
                setTimeText(t);
                applyDateTime(dateText, t);
              }}
              placeholder="hh:mm"
            />
          </View>
        ) : null}
        {isFutureDate ? (
          <ThemedText type="caption" themeColor="text3">
            Scheduled?
          </ThemedText>
        ) : null}

        <View>
          <TextField value={draft.account} onChangeText={(account) => draft.patch({ account })} placeholder="Account" />
          {accountSuggestions.length > 0 ? (
            <View style={styles.suggestionList}>
              {accountSuggestions.map((rule) => (
                <Pressable
                  key={rule.normalizedKey}
                  accessibilityRole="button"
                  onPress={() => pickAccountSuggestion(rule)}
                  style={styles.suggestionRow}
                >
                  <ThemedText type="body" themeColor="text">
                    {rule.displayAccount}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="text3">
                    {rule.categoryId
                      ? ((categories ?? []).find((c) => c.id === rule.categoryId)?.name ?? 'Category')
                      : 'Uncategorized'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
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
          {PRIMARY_LABEL[mode]}
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
  dateEditRow: { flexDirection: 'row', gap: Spacing.two },
  suggestionList: {
    marginTop: Spacing.one,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface2,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  error: { paddingHorizontal: Spacing.one },
  primaryRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  primaryButton: { width: '100%' },
});
