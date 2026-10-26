/**
 * `AccountSheet` — Add / Edit account (SPEC-UI-UX.md §6.25 UI-103a, SPEC-implementation.md §46.9). One sheet for both
 * `'createAccount'` and `'editAccount'`: no `accountId` param ⇒ "Add account" (optionally pre-set to a `kind` from the
 * section's Add button), an id ⇒ "Edit account" pre-filled from the stored row.
 *
 * Fields: Kind · Nickname (required) · Bank name (bank / card only) · Last 4 digits (optional — what SMS matching
 * uses) · **Current balance** (optional — what the bank app shows today; saved as a manual snapshot, D44, only when
 * changed; texts keep it fresh afterwards; a card's figure is its available credit). Edit adds Archive / Unarchive and
 * **Merge into…** (one real account detected twice: everything moves to the chosen account, this one is removed).
 *
 * Opening an auto-created account clears its **New** pill (UI-104) — "until the user opens it" (§46.2).
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import {
  archiveAccount,
  countAccountTransactions,
  createAccount,
  DuplicateAccountError,
  getAccount,
  markAccountSeen,
  mergeAccounts,
  unarchiveAccount,
  updateAccount,
  useAccounts,
} from '@/db/repositories/accounts';
import { listAccountViews, recordSnapshot } from '@/db/repositories/balances';
import { scheduleCardBillReminders } from '@/services/notifications/card-bill-reminder';
import type { AccountKind, MyAccount } from '@/db/schema';
import { useSheetRegistry } from '@/stores';
import { useAccountDraft } from '@/stores/account-draft';

import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { Icon } from '@/ui/icon';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

import { ACCOUNT_KIND_ICON, accountName, accountSubtitle } from './account-label';

const KIND_OPTIONS: readonly { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'credit_card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'cash', label: 'Cash' },
];

/** "12,340.50" / "-500" → paise; "" or junk → null. */
export function parseRupees(text: string): number | null {
  const t = text.replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const negative = t.startsWith('-');
  const [major, frac = ''] = t.replace('-', '').split('.');
  const minor = parseInt(major, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return negative ? -minor : minor;
}

/** paise → "12340.5" for editing (no grouping, so it types back cleanly); undefined → "". */
function rupeesText(minor: number | undefined): string {
  if (minor === undefined) return '';
  const abs = Math.abs(minor);
  const frac = abs % 100;
  const text = `${Math.floor(abs / 100)}${frac ? `.${String(frac).padStart(2, '0')}` : ''}`;
  return minor < 0 ? `-${text}` : text;
}

export function AccountSheet() {
  const params = useSheetRegistry((s) => s.params) as { accountId?: string; kind?: AccountKind };
  const close = useSheetRegistry((s) => s.close);
  const draft = useAccountDraft();
  const { data: accounts } = useAccounts();

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<MyAccount | null>(null);
  const [mergeCount, setMergeCount] = useState(0);
  const [pickingMerge, setPickingMerge] = useState(false);

  const editing = !!params.accountId;
  const stored = editing ? (accounts ?? []).find((a) => a.id === params.accountId) : undefined;

  useEffect(() => {
    if (params.accountId) {
      const account = getAccount(params.accountId);
      if (!account) {
        close();
        return;
      }
      useAccountDraft.getState().open({
        accountId: account.id,
        kind: account.kind,
        nickname: account.nickname,
        bankName: account.bankName ?? '',
        last4: account.last4 ?? '',
        balanceText: rupeesText(listAccountViews({ includeArchived: true }).find((v) => v.account.id === account.id)?.balance?.balanceMinor),
      });
      if (account.autoCreated) markAccountSeen(account.id);
    } else {
      useAccountDraft.getState().open({ kind: params.kind ?? 'bank' });
    }
  }, [params.accountId, params.kind, close]);

  const hasBank = draft.kind === 'bank' || draft.kind === 'credit_card';
  const saveDisabled =
    draft.nickname.trim().length === 0 || (draft.balanceText.trim() !== '' && parseRupees(draft.balanceText) === null);

  const handleCancel = useCallback(() => {
    if (useAccountDraft.getState().dirty) setShowDiscardConfirm(true);
    else close();
  }, [close]);

  // the hardware / gesture back button gets the same discard guard as Cancel (V-6)
  useEffect(() => {
    useSheetRegistry.getState().setOnRequestClose(handleCancel);
    return () => useSheetRegistry.getState().setOnRequestClose(null);
  }, [handleCancel]);

  const finish = () => {
    draft.reset();
    close();
  };

  const handleSave = () => {
    if (saveDisabled) return;
    draft.setSubmitting(true);
    const fields = {
      kind: draft.kind,
      nickname: draft.nickname,
      bankName: hasBank ? draft.bankName : null,
      last4: draft.kind === 'cash' ? null : draft.last4,
    };
    try {
      const id = draft.accountId ?? createAccount(fields).id;
      if (draft.accountId) updateAccount(draft.accountId, fields);
      const typed = parseRupees(draft.balanceText);
      if (draft.balanceText !== useAccountDraft.getState()._initial.balanceText && typed !== null) {
        recordSnapshot({ accountId: id, balanceMinor: typed, asOf: Date.now(), source: 'manual' });
      }
      scheduleCardBillReminders().catch(() => {}); // a kind change / archive can add or drop a card's reminder
      finish();
    } catch (e) {
      if (e instanceof DuplicateAccountError) {
        const other = getAccount(e.existingId);
        draft.setError(
          draft.accountId
            ? `${accountName(other)} already has these digits — use Merge into… instead.`
            : `${accountName(other)} already has these digits.`,
        );
      } else {
        draft.setError('Could not save. Try again.');
      }
    }
  };

  const toggleArchive = () => {
    if (!stored) return;
    if (stored.archivedAt) unarchiveAccount(stored.id);
    else archiveAccount(stored.id);
    scheduleCardBillReminders().catch(() => {});
    finish();
  };

  const askMerge = (target: MyAccount) => {
    if (!draft.accountId) return;
    setMergeCount(countAccountTransactions(draft.accountId));
    setMergeTarget(target);
  };

  const doMerge = () => {
    if (!draft.accountId || !mergeTarget) return;
    mergeAccounts(draft.accountId, mergeTarget.id);
    setMergeTarget(null);
    finish();
  };

  const mergeCandidates = (accounts ?? []).filter((a) => a.id !== draft.accountId && !a.archivedAt);

  return (
    <BottomSheetScrollView keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={handleCancel}>
          <ThemedText type="label" themeColor="text2">
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText type="title" style={styles.headerTitle}>
          {editing ? 'Edit account' : 'Add account'}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <ThemedText type="label" themeColor="text3">
          Kind
        </ThemedText>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {KIND_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} selected={draft.kind === o.value} onPress={() => draft.patch({ kind: o.value })} />
          ))}
        </View>

        <ThemedText type="label" themeColor="text3" style={styles.label}>
          Nickname
        </ThemedText>
        <TextField
          value={draft.nickname}
          onChangeText={(nickname) => draft.patch({ nickname })}
          maxLength={32}
          placeholder={draft.kind === 'cash' ? 'Cash in hand' : 'e.g. Salary – HDFC'}
        />

        {hasBank ? (
          <>
            <ThemedText type="label" themeColor="text3" style={styles.label}>
              Bank name
            </ThemedText>
            <TextField
              value={draft.bankName}
              onChangeText={(bankName) => draft.patch({ bankName })}
              maxLength={40}
              placeholder="e.g. HDFC Bank"
            />
          </>
        ) : null}

        {draft.kind !== 'cash' ? (
          <>
            <ThemedText type="label" themeColor="text3" style={styles.label}>
              Last 4 digits
            </ThemedText>
            <TextField
              value={draft.last4}
              onChangeText={(last4) => draft.patch({ last4: last4.replace(/\D/g, '').slice(-4) })}
              maxLength={4}
              keyboardType="number-pad"
              placeholder="Optional — used to match bank texts"
            />
          </>
        ) : null}

        <ThemedText type="label" themeColor="text3" style={styles.label}>
          {draft.kind === 'credit_card' ? 'Available credit' : 'Current balance'}
        </ThemedText>
        <TextField
          value={draft.balanceText}
          onChangeText={(balanceText) => draft.patch({ balanceText: balanceText.replace(/[^\d.,-]/g, '') })}
          maxLength={16}
          keyboardType="decimal-pad"
          placeholder="Optional — what your bank app shows today"
        />
        {draft.balanceText.trim() && parseRupees(draft.balanceText) === null ? (
          <ThemedText type="caption" themeColor="text" style={styles.error}>
            That is not an amount.
          </ThemedText>
        ) : null}

        {draft.error ? (
          <ThemedText type="label" themeColor="text" style={styles.error}>
            {draft.error}
          </ThemedText>
        ) : null}

        {editing && stored ? (
          <View style={styles.manage}>
            <Pressable accessibilityRole="button" onPress={toggleArchive} style={styles.manageRow}>
              <Icon name="bookmark" size={18} color="text3" />
              <ThemedText type="body" themeColor="text" style={styles.manageLabel}>
                {stored.archivedAt ? 'Unarchive' : 'Archive'}
              </ThemedText>
            </Pressable>
            {mergeCandidates.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => setPickingMerge((v) => !v)} style={styles.manageRow}>
                <Icon name="arrow-left-right" size={18} color="text3" />
                <ThemedText type="body" themeColor="text" style={styles.manageLabel}>
                  Merge into…
                </ThemedText>
                <Icon name="chevron-right" size={16} color="text3" />
              </Pressable>
            ) : null}
            {pickingMerge
              ? mergeCandidates.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Merge into ${a.nickname}`}
                    onPress={() => askMerge(a)}
                    style={styles.mergeRow}
                  >
                    <Icon name={ACCOUNT_KIND_ICON[a.kind]} size={16} color="text3" />
                    <View style={styles.manageLabel}>
                      <ThemedText type="body" themeColor="text">
                        {a.nickname}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="text3">
                        {accountSubtitle(a)}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))
              : null}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button
          variant={saveDisabled ? 'disabled' : 'primary'}
          onPress={handleSave}
          loading={draft.submitting}
          style={styles.saveButton}
        >
          Save
        </Button>
      </View>

      <ConfirmDialog
        visible={showDiscardConfirm}
        glyph="triangle-alert"
        title="Discard changes?"
        body="Your edits won't be saved."
        confirmLabel="Discard"
        onConfirm={() => {
          setShowDiscardConfirm(false);
          finish();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
      <ConfirmDialog
        visible={mergeTarget !== null}
        glyph="triangle-alert"
        title={`Merge into ${mergeTarget?.nickname ?? ''}?`}
        body={`${mergeCount} transaction${mergeCount === 1 ? '' : 's'} and its balances move to ${mergeTarget?.nickname ?? ''}. This account is removed.`}
        confirmLabel="Merge"
        onConfirm={doMerge}
        onCancel={() => setMergeTarget(null)}
      />
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: 44 },
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.three },
  label: { marginTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  error: { paddingHorizontal: Spacing.one },
  manage: {
    marginTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 48 },
  manageLabel: { flex: 1 },
  mergeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 52, paddingLeft: Spacing.four },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  saveButton: { width: '100%' },
});
