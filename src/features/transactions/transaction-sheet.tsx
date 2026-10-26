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
 * Date & time is editable via a hand-rolled calendar-grid + hour/minute stepper (`DateTimePicker`,
 * `src/ui/date-time-picker.tsx`) revealed on tap — no native date-picker dependency, consistent
 * with the app's other hand-rolled controls.
 *
 * "Paid to / from" autocomplete (`searchByPrefix`) shows past merchants as you type; picking one pre-fills
 * its remembered category (§6.5) — not note/payment method, which is F8's broader "known-rule"
 * pre-fill on a *detected* suggestion (a different trigger from typing here). The field was labelled
 * "Account" before CR-34 (UI-101); "account" now means one of YOUR accounts.
 *
 * CR-34 (§6.25): **Paid from / Paid into** chips pick which of your accounts the money moved on (only the
 * accounts that fit the payment method, UI-102); the **Transfer** segment (Add, or editing a transfer) moves
 * money between two of your accounts — amount, From, To, date, note, nothing else (UI-105).
 *
 * Deferred for both (documented, not silent — see `SPEC/traceability.md`):
 *  - The amount block doesn't collapse to a sticky summary bar on scroll, and the numeric
 *    keypad doesn't swap for the OS keyboard when a text field is focused — both stay docked;
 *    text fields simply also raise the OS keyboard on top when focused.
 *  - Payment method is a `SegmentedControl` row rather than its own picker sheet.
 */

import { BottomSheetScrollView, type BottomSheetScrollViewMethods } from '@gorhom/bottom-sheet';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { getAccountRule, searchByPrefix } from '@/db/repositories/account-rules';
import { lastUsedAccountForMethod, listAccounts, useAccounts } from '@/db/repositories/accounts';
import { useCategories } from '@/db/repositories/categories';
import { getSuggestion } from '@/db/repositories/suggestions';
import { getSplitForTransaction, listOpenShares } from '@/db/repositories/splits';
import { getTransaction, searchNotesByPrefix } from '@/db/repositories/transactions';
import { unlinkTransfer } from '@/db/repositories/transfers';
import type { AccountRule, PaymentMethod } from '@/db/schema';
import { accountFitsMethod, preselectAccount } from '@/domain/accounts/method-kinds';
import { resolveCategoryForAccount, ruleCategoryFor } from '@/domain/categorize';
import { formatMoney, formatRupees } from '@/domain/format/money';
import { recomputeYourShare } from '@/domain/split';
import { eraseTimeDigit, TIME_FIELD_MAX, typeTimeDigit, type TimeField } from '@/domain/time-entry';
import { sendRequests, summarizeReport } from '@/services/splits/send-requests';
import { useAddSheetDraft, useKeypad, useSheetRegistry } from '@/stores';
import type { AddSheetDraft } from '@/stores/add-sheet-draft';
import type { KeypadKey } from '@/stores/keypad';
import { useSplitDraft } from '@/stores/split-draft';
import { useToast } from '@/stores/toast';

import { AmountInput } from '@/ui/amount-input';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { DateTimePicker } from '@/ui/date-time-picker';
import { Icon } from '@/ui/icon';
import { NumericKeypad } from '@/ui/numeric-keypad';
import { SegmentedControl } from '@/ui/segmented-control';
import { SelectorRow } from '@/ui/selector-row';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

import { AccountChips } from '../accounts/account-chips';
import { flushPendingCategoryPick } from '../categories/category-picker-sheet';
import { persistSplitDraft } from '../splits/persist-split';
import { settleAndAnnounce } from '../splits/settle-and-announce';
import { SuggestedSettlementBanner, useSettlementSuggestion } from '../splits/suggested-settlement-banner';
import { writeConfirmedTransaction, writeEditedTransaction, writeTransfer, type SmsRef } from './write-confirmed-transaction';

const PAYMENT_METHOD_OPTIONS = [
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
] as const;

/** ₹10,00,000 in paise — §6.4 edge threshold (Confirm mode only; Add just disables the button). */
const MAX_SANE_AMOUNT_MINOR = 10_00_000_00;

/** CR-31 — how far past "now" a date must be before the "in the future" hint shows. */
const FUTURE_DATE_SLACK_MS = 60_000;

const HEADER_TITLE = {
  confirm: 'Review transaction',
  add: 'Add transaction',
  edit: 'Edit transaction',
} as const;

const PRIMARY_LABEL = { confirm: 'Add', add: 'Add', edit: 'Save' } as const;

export type TransactionSheetMode = 'confirm' | 'add' | 'edit';

/**
 * UI-102 — the account to show selected for `method`: `current` while it still fits, else the one fitting account /
 * the one last used with this method, else none (*Not sure*).
 */
function accountForMethod(method: PaymentMethod | null, current: string | null): string | null {
  const accounts = listAccounts();
  const cur = current ? accounts.find((a) => a.id === current) : undefined;
  if (cur && accountFitsMethod(cur.kind, method)) return cur.id;
  return preselectAccount(accounts, method, lastUsedAccountForMethod(method));
}

export function TransactionSheetBody({ mode }: { mode: TransactionSheetMode }) {
  const params = useSheetRegistry((s) => s.params) as {
    suggestionId?: string;
    transactionId?: string;
    /** CR-34 (UI-107) — Needs a look › Add transaction opens Add pre-filled */
    prefill?: Partial<Pick<AddSheetDraft, 'amountMinor' | 'direction' | 'accountId' | 'paymentMethod' | 'occurredAt' | 'note'>>;
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

  // Date & time editing — the picker is closed by default, revealed on tap.
  const [editingDate, setEditingDate] = useState(false);

  // CR-31 — the numeric keypad only shows while something is being typed with it: the amount, or the hour /
  // minute of Date & time. A fresh Add starts on the amount; Confirm and Edit (amount already filled) start with
  // it hidden — tap the amount to bring it back. Tapping a text field, or another control, puts it away. The
  // initial value reads the store directly: this body remounts on every return from a sub-sheet (Category, Split).
  const [keypadTarget, setKeypadTarget] = useState<'amount' | TimeField | null>(() =>
    mode === 'add' && useAddSheetDraft.getState().amountMinor === 0 ? 'amount' : null,
  );
  // Digits typed so far into the hour / minute (`domain/time-entry.ts`); reset whenever the target changes.
  const [timeBuffer, setTimeBuffer] = useState('');
  const pointKeypad = (target: 'amount' | TimeField | null) => {
    if (target) Keyboard.dismiss(); // the app keypad replaces the phone keyboard, never sits under it
    setTimeBuffer('');
    setKeypadTarget(target);
  };

  // CR-31 (found on-device) — the sheet does not move for the phone keyboard (it is a plain `TextInput`, not
  // gorhom's `BottomSheetTextInput`, and the 92% sheet has no room to rise), so the Account / Note / Description
  // fields — and their suggestion lists — ended up hidden behind the keyboard. Instead: while the keyboard is up, a
  // spacer of its height ends the scroll content, and focusing a field scrolls it to the top of the sheet.
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Each text field's top within the scroll content (its wrapper is a direct child, so `onLayout` y is content-relative).
  const fieldY = useRef<Record<'account' | 'note' | 'description', number>>({ account: 0, note: 0, description: 0 });
  const scrollFieldIntoView = (field: 'account' | 'note' | 'description') => {
    // after the keyboard (and the spacer) have had a moment to appear
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, fieldY.current[field] - Spacing.three), animated: true }), 150);
  };

  // CR-31 — note autocomplete: past notes starting with what is typed (case-insensitive), only while the Note
  // field has focus, hidden again right after one is picked (same idea as `pickedAccount`).
  const [noteFocused, setNoteFocused] = useState(false);
  const [pickedNote, setPickedNote] = useState<string | null>(null);
  const noteSuggestions: string[] =
    noteFocused && draft.note.trim() && draft.note !== pickedNote ? searchNotesByPrefix(draft.note) : [];
  // `Date.now()` can't be called inline during render (React Compiler purity rule) — a lazy
  // `useState` initializer is the sanctioned one-time-impure-read escape hatch, so "now" here
  // means "whenever this sheet instance was mounted," stable for its lifetime. Good enough for
  // an edge-case helper that doesn't need to react to the clock ticking while the sheet is open.
  const [openedAtMs] = useState(() => Date.now());
  // CR-31: a fresh Add stamps `occurredAt` a few ms *after* this sheet mounted, so a strict `>` flagged every new
  // transaction as future. A minute of slack keeps the hint for real future picks only.
  const isFutureDate = draft.occurredAt > openedAtMs + FUTURE_DATE_SLACK_MS;

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
          accountId: accountForMethod('upi', null),
          toAccountId: null,
          ...(params.prefill
            ? { ...params.prefill, type: params.prefill.direction === 'credit' ? 'income' : 'expense' }
            : {}),
        });
        useKeypad.getState().reset();
        if (params.prefill?.amountMinor) useKeypad.getState().setFromMinor(params.prefill.amountMinor);
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
      // a transfer is edited as a pair: From = the debit side's account, To = the credit side's (§46.6)
      const peer = txn.transferPeerId ? getTransaction(txn.transferPeerId) : null;
      const isTransferRow = txn.type === 'transfer';
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
        accountId: isTransferRow && txn.direction === 'credit' ? (peer?.accountId ?? null) : txn.accountId,
        toAccountId: isTransferRow ? (txn.direction === 'credit' ? txn.accountId : (peer?.accountId ?? null)) : null,
      });
      useKeypad.getState().setFromMinor(txn.amountMinor);
      // V2: show the transaction's existing split in the "Split with N" row; Cancel drops any change to it.
      const existingSplit = getSplitForTransaction(txn.id);
      useSplitDraft.getState().seedExisting(
        existingSplit
          ? {
              splitId: existingSplit.split.id,
              shares: existingSplit.shares.map((s) => ({
                key: s.personId,
                personId: s.personId,
                name: s.person.displayName,
                phone: s.person.phoneDisplay,
                contactRef: s.person.contactRef,
                source: s.person.source,
                amountMinor: s.amountMinor,
                waived: s.waivedAt != null,
              })),
            }
          : null,
      );
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
    const direction = suggestion.direction ?? 'debit';
    const resolved = resolveCategoryForAccount(rule, direction); // CR-28: expense vs income category
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
      // §46.5 — the account the SMS named; else the UI-102 preselection for the method
      accountId: suggestion.accountId ?? accountForMethod(resolved.paymentMethod ?? suggestion.paymentMethod, null),
      toAccountId: null,
    });
    useKeypad.getState().setFromMinor(amountMinor);
    smsRefRef.current = {
      sender: suggestion.smsSender,
      receivedAt: suggestion.smsReceivedAt,
      dedupeKey: suggestion.dedupeKey,
    };
  }, [mode, suggestionId, params.transactionId, params.prefill, close]);

  const handleKey = (key: KeypadKey) => {
    if (keypadTarget === 'amount') {
      useKeypad.getState().press(key);
      draft.patch({ amountMinor: useKeypad.getState().amountMinor });
      return;
    }
    if (keypadTarget !== 'hour' && keypadTarget !== 'minute') return;
    if (key === '.') return; // no decimals in a time
    // CR-31: typing an hour / minute — see `domain/time-entry.ts` for the digit rules.
    const entry = key === 'back' ? eraseTimeDigit(timeBuffer) : typeTimeDigit(timeBuffer, key, TIME_FIELD_MAX[keypadTarget]);
    const next = new Date(useAddSheetDraft.getState().occurredAt);
    if (keypadTarget === 'hour') next.setHours(entry.value);
    else next.setMinutes(entry.value);
    draft.patch({ occurredAt: next.getTime() });
    if (entry.complete && keypadTarget === 'hour') {
      setKeypadTarget('minute'); // a finished hour moves on to the minutes, like a phone's time entry
      setTimeBuffer('');
    } else {
      setTimeBuffer(entry.buffer);
    }
  };

  const pickAccountSuggestion = (rule: AccountRule) => {
    setPickedAccount(rule.displayAccount);
    draft.patch({ account: rule.displayAccount, categoryId: ruleCategoryFor(rule, draft.direction) });
  };

  const categoryName =
    draft.categoryId === null
      ? 'Uncategorized'
      : (categories ?? []).find((c) => c.id === draft.categoryId)?.name ?? 'Uncategorized';

  // CR-34 — your accounts. Archived ones are only shown when a row already uses one.
  const { data: accountRows } = useAccounts();
  const allAccounts = accountRows ?? [];
  const liveAccounts = allAccounts.filter((a) => !a.archivedAt);
  const isTransfer = draft.type === 'transfer';
  const seededAsTransfer = useAddSheetDraft((s) => s._initial.type === 'transfer');
  const canTransfer = mode === 'add' ? liveAccounts.length >= 2 : mode === 'edit' && seededAsTransfer;
  const withCurrent = (list: typeof allAccounts, id: string | null) => {
    const cur = id ? allAccounts.find((a) => a.id === id) : undefined;
    return cur && !list.some((a) => a.id === cur.id) ? [...list, cur] : list;
  };
  // UI-102 — only the accounts that fit the payment method, plus the current one (with a ⚠) when it does not
  const paidFromAccounts = withCurrent(
    liveAccounts.filter((a) => accountFitsMethod(a.kind, draft.paymentMethod)),
    draft.accountId,
  );
  const misfitIds = new Set(
    paidFromAccounts.filter((a) => !accountFitsMethod(a.kind, draft.paymentMethod)).map((a) => a.id),
  );
  const fromAccounts = withCurrent(liveAccounts, draft.accountId);
  const toAccounts = withCurrent(liveAccounts, draft.toAccountId).filter((a) => a.id !== draft.accountId);

  const isEdgeAmount = draft.amountMinor === 0 || draft.amountMinor > MAX_SANE_AMOUNT_MINOR;
  // Confirm allows ₹0 through its own edge-amount extra-confirm gate below; Add and Edit both
  // just stay disabled until there's a real amount (§6.5/§6.6 — Edit is "identical to Add").
  // A transfer needs From, and (when adding) a different To — a single-sided transfer (a card bill) has no To.
  const transferIncomplete =
    isTransfer &&
    (!draft.accountId || (mode === 'add' && !draft.toAccountId) || draft.accountId === draft.toAccountId);
  const addDisabled = (mode !== 'confirm' && draft.amountMinor <= 0) || transferIncomplete;

  // V2 (IMP-089): with a split on this transaction other people's shares stay fixed and YOUR share is
  // recomputed from the amount — if that would go below ₹0, Save is blocked until the split is edited.
  const committedSplit = useSplitDraft((s) => s.committed);
  const splitDirty = useSplitDraft((s) => s.dirty);
  const splitActive = draft.direction === 'debit' && committedSplit !== null && committedSplit.length > 0;
  const splitYours = splitActive ? recomputeYourShare(draft.amountMinor, committedSplit.map((c) => c.amountMinor)) : null;
  const splitBlocked = splitYours !== null && !splitYours.ok;
  // What it really costs you: amount − the shares others still owe (a waived share is absorbed by you).
  const splitCost = splitActive
    ? Math.max(0, draft.amountMinor - committedSplit.filter((c) => !c.waived).reduce((a, c) => a + c.amountMinor, 0))
    : null;

  // V2 (UI-078): a credit that looks like someone paying their share offers to settle it. Nothing is written until
  // Save — the transaction doesn't exist yet — and only if the user pressed Settle (IMP-085).
  const [openShares] = useState(() => (mode === 'confirm' ? listOpenShares() : []));
  const settlementSuggestion = useSettlementSuggestion(openShares, {
    availableMinor: draft.amountMinor,
    account: draft.account,
    isCredit: mode === 'confirm' && draft.direction === 'credit',
  });
  const [settleChosen, setSettleChosen] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const handleCancel = useCallback(() => {
    flushPendingCategoryPick(); // a pick made a moment ago still counts as a change (CR-19)
    if (useAddSheetDraft.getState().dirty || splitDirty) setShowDiscardConfirm(true);
    else close();
  }, [splitDirty, close]);

  // Registers this sheet's own Cancel logic (dirty-check + discard confirm, V-6) as the
  // handler `useSheetRegistry().requestClose()` invokes — so the hardware/gesture back button
  // (SheetHost) gets the exact same guard the Cancel button does, not a bypass of it.
  useEffect(() => {
    useSheetRegistry.getState().setOnRequestClose(handleCancel);
    return () => useSheetRegistry.getState().setOnRequestClose(null);
  }, [handleCancel]);

  const doDiscard = () => {
    setShowDiscardConfirm(false);
    useSplitDraft.getState().reset();
    draft.reset();
    close();
  };

  const submit = () => {
    flushPendingCategoryPick(); // CR-19: a category picked a moment ago must be in what gets saved
    draft.setSubmitting(true);
    try {
      const current = useAddSheetDraft.getState();
      if (current.type === 'transfer') {
        // UI-105 — a transfer has no split, settlement or merchant; it is written as a pair and that is all
        writeTransfer(current);
        if (mode === 'add') useToast.getState().show(`Transfer of ${formatRupees(current.amountMinor)} added`);
        useSplitDraft.getState().reset();
        draft.reset();
        close();
        return;
      }
      let savedTransactionId: string | undefined;
      if (mode === 'edit') {
        writeEditedTransaction(current);
        savedTransactionId = current.sourceId;
      } else {
        // §30.6/§30.7 — Add/Confirm's save toast; Edit's own spec (§30.8) doesn't have one.
        const { transactionId, linkedPeerId } = writeConfirmedTransaction(current, smsRefRef.current);
        savedTransactionId = transactionId;
        if (linkedPeerId) {
          // UI-106 — it matched a row on another of your accounts: it is a transfer now, not spending / income
          useToast.getState().show('Linked as a transfer', { label: 'Undo', onPress: () => unlinkTransfer(transactionId) }, 4000);
        } else {
          const signedMinor = current.direction === 'credit' ? current.amountMinor : -current.amountMinor;
          useToast.getState().show(`Added ${formatMoney(signedMinor)}`, {
            label: 'View',
            onPress: () => router.push(`/transaction/${transactionId}`),
          });
        }
      }
      // V2: the transaction is saved; now write its split (if any). A split failure must never lose the transaction.
      if (savedTransactionId) {
        const pendingSplit = useSplitDraft.getState().pending();
        try {
          const persisted = persistSplitDraft(savedTransactionId, pendingSplit, { direction: current.direction });
          // V2 phase 5 (§42.3): the split is on disk — now text whoever still needs asking. The sheet closes
          // straight away; the outcome arrives as a toast, and every result is recorded on the share either way.
          if (pendingSplit.send && (persisted.kind === 'created' || persisted.kind === 'updated')) {
            sendRequests(persisted.splitId)
              .then((report) => {
                const message = summarizeReport(report);
                if (message) useToast.getState().show(message);
              })
              .catch(() => useToast.getState().show('Could not send the requests — retry from Details'));
          }
        } catch {
          useToast.getState().show('Saved, but the split could not be saved');
        }
      }
      if (savedTransactionId && settleChosen && settlementSuggestion) {
        settleAndAnnounce(
          { transactionId: savedTransactionId, picks: [{ shareId: settlementSuggestion.shareId }] },
          'share',
          new Map([[settlementSuggestion.shareId, settlementSuggestion.personName]]),
        );
      }
      useSplitDraft.getState().reset();
      draft.reset();
      close();
    } catch {
      draft.setSubmitting(false);
      draft.setError('Could not save. Try again.');
    }
  };

  const handleAdd = () => {
    if (addDisabled || splitBlocked) return;
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

      {/* `handled`: a tap on a suggestion row lands while the phone keyboard is still up (CR-31 note autocomplete) */}
      <BottomSheetScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Amount"
          accessibilityHint="Opens the keypad to type the amount"
          onPress={() => pointKeypad('amount')}
        >
          <AmountInput
            amountMinor={draft.amountMinor}
            mode="full"
            active={keypadTarget === 'amount'}
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
        </Pressable>

        <SegmentedControl
          options={
            canTransfer
              ? [
                  { value: 'debit', label: 'Expense' },
                  { value: 'credit', label: 'Income' },
                  { value: 'transfer', label: 'Transfer' },
                ]
              : [
                  { value: 'debit', label: 'Expense' },
                  { value: 'credit', label: 'Income' },
                ]
          }
          value={isTransfer ? 'transfer' : draft.direction}
          onChange={(segment) => {
            pointKeypad(null);
            if (segment === 'transfer') {
              draft.patch({ type: 'transfer', direction: 'debit', categoryId: null });
              return;
            }
            const direction = segment;
            // CR-28: an expense category is wrong for income (and vice versa) — drop a pick that no longer fits.
            const kind = direction === 'credit' ? 'income' : 'expense';
            const now = useAddSheetDraft.getState();
            const picked = (categories ?? []).find((c) => c.id === now.categoryId);
            draft.patch({
              direction,
              type: kind,
              ...(picked && picked.appliesTo !== kind ? { categoryId: null } : {}),
              // leaving Transfer: the From account stays only if it fits the payment method
              ...(now.type === 'transfer'
                ? { accountId: accountForMethod(now.paymentMethod, now.accountId), toAccountId: null }
                : {}),
            });
          }}
        />

        {isTransfer ? (
          <>
            <AccountChips
              label="From"
              accounts={fromAccounts}
              value={draft.accountId}
              onChange={(accountId) => {
                pointKeypad(null);
                draft.patch({ accountId, ...(accountId === draft.toAccountId ? { toAccountId: null } : {}) });
              }}
            />
            <AccountChips
              label="To"
              accounts={toAccounts}
              value={draft.toAccountId}
              onChange={(toAccountId) => {
                pointKeypad(null);
                draft.patch({ toAccountId });
              }}
            />
          </>
        ) : null}

        {!isTransfer && settlementSuggestion && !suggestionDismissed ? (
          <SuggestedSettlementBanner
            personName={settlementSuggestion.personName}
            amountMinor={draft.amountMinor}
            pending={settleChosen}
            onSettle={() => setSettleChosen(true)}
            onDismiss={() => (settleChosen ? setSettleChosen(false) : setSuggestionDismissed(true))}
          />
        ) : null}

        {!isTransfer ? (
          <>
            <SelectorRow
              icon="tag"
              label="Category"
              value={categoryName}
              onPress={() => open('categoryPicker', { ...params, returnTo: mode })}
            />

            <View style={styles.methodBlock}>
              <ThemedText type="label" themeColor="text3">
                Payment method
              </ThemedText>
              <SegmentedControl
                options={PAYMENT_METHOD_OPTIONS}
                value={draft.paymentMethod ?? 'upi'}
                onChange={(paymentMethod) => {
                  pointKeypad(null);
                  // UI-102: the account follows the method — kept while it fits, else re-picked
                  draft.patch({ paymentMethod, accountId: accountForMethod(paymentMethod, useAddSheetDraft.getState().accountId) });
                }}
              />
            </View>

            {paidFromAccounts.length > 0 ? (
              <AccountChips
                label={draft.direction === 'credit' ? 'Paid into' : 'Paid from'}
                accounts={paidFromAccounts}
                value={draft.accountId}
                onChange={(accountId) => {
                  pointKeypad(null);
                  draft.patch({ accountId });
                }}
                notSure
                misfitIds={misfitIds}
              />
            ) : null}
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            pointKeypad(null); // opening shows the calendar; tap the hour or minute to type it
            setEditingDate((v) => !v);
          }}
        >
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
          <DateTimePicker
            valueMs={draft.occurredAt}
            onChange={(ms) => draft.patch({ occurredAt: ms })}
            activeField={keypadTarget === 'hour' || keypadTarget === 'minute' ? keypadTarget : null}
            onFieldPress={(field) => pointKeypad(field)}
          />
        ) : null}
        {isFutureDate ? (
          <ThemedText type="caption" themeColor="text3">
            This date is in the future
          </ThemedText>
        ) : null}

        {!isTransfer ? (
          <View onLayout={(e) => (fieldY.current.account = e.nativeEvent.layout.y)} style={styles.fieldBlock}>
            {/* UI-101 — the other party; "account" now means one of YOUR accounts */}
            <ThemedText type="label" themeColor="text3">
              Paid to / from
            </ThemedText>
            <TextField
              value={draft.account}
              onChangeText={(account) => draft.patch({ account })}
              placeholder="Shop or person"
              onFocus={() => {
                pointKeypad(null);
                scrollFieldIntoView('account');
              }}
            />
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
                      {ruleCategoryFor(rule, draft.direction)
                        ? ((categories ?? []).find((c) => c.id === ruleCategoryFor(rule, draft.direction))?.name ?? 'Category')
                        : 'Uncategorized'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <View onLayout={(e) => (fieldY.current.note = e.nativeEvent.layout.y)}>
          <TextField
            value={draft.note}
            onChangeText={(note) => draft.patch({ note })}
            placeholder="Note"
            onFocus={() => {
              pointKeypad(null);
              setNoteFocused(true);
              scrollFieldIntoView('note');
            }}
            onBlur={() => setNoteFocused(false)}
          />
          {noteSuggestions.length > 0 ? (
            <View style={styles.suggestionList}>
              {noteSuggestions.map((note) => (
                <Pressable
                  key={note}
                  accessibilityRole="button"
                  accessibilityLabel={`Use note ${note}`}
                  onPress={() => {
                    setPickedNote(note);
                    draft.patch({ note });
                  }}
                  style={styles.suggestionRow}
                >
                  <Icon name="history" size={16} color="text3" />
                  <ThemedText type="body" themeColor="text" style={styles.suggestionText} numberOfLines={1}>
                    {note}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        {!isTransfer ? (
          <View onLayout={(e) => (fieldY.current.description = e.nativeEvent.layout.y)}>
            <TextField
              value={draft.description}
              onChangeText={(description) => draft.patch({ description })}
              placeholder="Description (optional)"
              multiline
              onFocus={() => {
                pointKeypad(null);
                scrollFieldIntoView('description');
              }}
            />
          </View>
        ) : null}

        {mode !== 'add' && !isTransfer && draft.direction === 'debit' && draft.amountMinor > 0 ? (
          <SplitRow
            committed={committedSplit}
            yourMinor={splitCost}
            blocked={splitBlocked}
            onPress={() => open('split', { ...params, returnTo: mode })}
          />
        ) : null}

        {draft.error ? (
          <ThemedText type="label" themeColor="text" style={styles.error}>
            {draft.error}
          </ThemedText>
        ) : null}
        {keyboardHeight > 0 ? <View style={{ height: keyboardHeight }} /> : null}
      </BottomSheetScrollView>

      {keypadTarget ? <NumericKeypad onKey={handleKey} /> : null}
      <View style={styles.primaryRow}>
        <Button
          variant={addDisabled || splitBlocked ? 'disabled' : 'primary'}
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

/** §6.4 / §6.6 (V2, CR-4) — the quiet "Split…" row under Description; shows the split once one is set. */
function SplitRow({
  committed,
  yourMinor,
  blocked,
  onPress,
}: {
  committed: readonly { amountMinor: number }[] | null;
  yourMinor: number | null;
  blocked: boolean;
  onPress: () => void;
}) {
  const has = committed !== null && committed.length > 0;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.staticRow}>
        <Icon name="users" size={18} color="text3" />
        <ThemedText type="body" themeColor="text" style={styles.staticLabel}>
          {has ? `Split with ${committed.length}` : 'Split…'}
        </ThemedText>
        {has && yourMinor !== null && !blocked ? (
          <ThemedText type="body" themeColor="text3">
            {formatRupees(yourMinor)} yours
          </ThemedText>
        ) : null}
        <Icon name="chevron-right" size={16} color="text3" />
      </Pressable>
      {blocked ? (
        <ThemedText type="caption" themeColor="text">
          Others’ shares are more than the amount — edit the split.
        </ThemedText>
      ) : null}
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
  fieldBlock: { gap: Spacing.one },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  staticLabel: { flex: 1 },
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
  // CR-31 — a note suggestion: history glyph + the note, left-aligned
  suggestionText: { flex: 1, marginLeft: Spacing.two },
  error: { paddingHorizontal: Spacing.one },
  primaryRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  primaryButton: { width: '100%' },
});
