/**
 * FILE PURPOSE
 * ------------
 * The **Merge sheet** (SPEC-UI-UX.md §6.20, UI-077): "which split did this payment settle?" — and, from the
 * other side, "which payment settled this share?".
 *
 * TWO ENTRY SHAPES (one component)
 * --------------------------------
 * - **Starting from a payment** (`transactionId` — Details › *Merge into a split…*): a checklist of the open
 *   items it could settle. A **credit** settles shares people owe you (grouped by person); a **debit** settles
 *   requests you owe. The best match, if any, sits on top under **Suggested**, pre-ticked; each ticked row has
 *   an amount defaulting to what is still owed, capped by what is left of the payment; the footer reads
 *   `₹450 of ₹450 used`. Whatever is not allocated simply stays an ordinary transaction (no leftover step).
 * - **Starting from an item** (`shareId` / `requestId` / `personId` — Splits › *Mark all paid…* / *Merge…*): a
 *   single-choice list of payments that could have settled it. A settlement always names a transaction (D37),
 *   so "mark as paid" means "pick the payment" — record it as a transaction first if it isn't there.
 *
 * Nothing here decides anything on its own: the suggestion is a pre-tick, the user always presses **Settle**
 * (IMP-085). The write and the Undo snackbar live in `settle-and-announce.ts`.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Colors, fontFamily, Radius, Spacing } from '@/constants/theme';
import {
  allocatedFromTransaction,
  listPaymentCandidates,
  type PaymentCandidate,
} from '@/db/repositories/settlements';
import { listOpenRequests } from '@/db/repositories/split-requests';
import { listOpenShares } from '@/db/repositories/splits';
import { getTransaction } from '@/db/repositories/transactions';
import { formatRupees } from '@/domain/format/money';
import { allocate } from '@/domain/settlement';
import { minorToRupeeText, parseRupeesToMinor } from '@/domain/split-draft';
import { suggestSettlement } from '@/domain/suggest-settlement';
import { useSheetRegistry } from '@/stores';

import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

import { settleAndAnnounce, type SettleTargetKind } from './settle-and-announce';

export type MergeParams = {
  /** Start from a payment: pick what it settled. */
  transactionId?: string;
  /** Start from an item: pick the payment that settled it. */
  shareId?: string;
  requestId?: string;
  /** All of one person's open shares ("Mark all paid…"). */
  personId?: string;
} & Record<string, unknown>;

/** One open item a payment could settle. */
export type TargetCandidate = {
  id: string;
  kind: SettleTargetKind;
  groupKey: string;
  groupName: string;
  /** The shared transaction's note, or the request's note. */
  label: string;
  remainingMinor: number;
  /** For ordering ties and the date shown. */
  atMs: number;
};

/** The open shares (for a credit) or accepted requests (for a debit) a payment could settle. */
export function targetCandidates(direction: 'credit' | 'debit'): TargetCandidate[] {
  if (direction === 'credit') {
    return listOpenShares().map((i) => ({
      id: i.shareId,
      kind: 'share',
      groupKey: i.personId,
      groupName: i.personName,
      label: i.label,
      remainingMinor: i.remainingMinor,
      atMs: i.occurredAt,
    }));
  }
  return listOpenRequests().map((r) => ({
    id: r.id,
    kind: 'request',
    groupKey: r.fromPhoneKey,
    groupName: r.fromLabel,
    label: r.forNote ?? '',
    remainingMinor: r.remainingMinor,
    atMs: r.receivedAt,
  }));
}

export function MergeSheet() {
  const params = useSheetRegistry((s) => s.params) as MergeParams;
  return params.transactionId ? <PaymentToTargets transactionId={params.transactionId} /> : <TargetToPayment params={params} />;
}

// ---------------------------------------------------------------------------------------------------------------
// Starting from a payment — tick what it settled
// ---------------------------------------------------------------------------------------------------------------

function PaymentToTargets({ transactionId }: { transactionId: string }) {
  const close = useSheetRegistry((s) => s.close);
  // Read once when the sheet opens — nothing else changes these while it is up.
  const [model] = useState(() => {
    const txn = getTransaction(transactionId);
    if (!txn) return null;
    const alreadyMinor = allocatedFromTransaction(txn.id);
    const availableMinor = txn.amountMinor - alreadyMinor;
    const candidates = targetCandidates(txn.direction);
    const suggestion = suggestSettlement({ amountMinor: availableMinor, account: txn.account }, candidates.map((c) => ({ id: c.id, personName: c.groupName, remainingMinor: c.remainingMinor })));
    return { txn, alreadyMinor, availableMinor, candidates, suggestion };
  });
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(model?.suggestion.bestId ? [model.suggestion.bestId] : []));
  const [texts, setTexts] = useState<Record<string, string>>({});

  const ordered = useMemo(() => {
    if (!model) return [];
    const byId = new Map(model.candidates.map((c) => [c.id, c]));
    return model.suggestion.orderedIds.map((id) => byId.get(id)!).filter(Boolean);
  }, [model]);

  const plan = useMemo(() => {
    if (!model) return { allocations: [], allocatedMinor: 0, unallocatedMinor: 0 };
    const picks = ordered
      .filter((c) => ticked.has(c.id))
      .map((c) => {
        const typed = texts[c.id];
        const requested = typed !== undefined ? parseRupeesToMinor(typed) : null;
        return { targetId: c.id, remainingMinor: c.remainingMinor, requestedMinor: typed === undefined ? undefined : (requested ?? 0) };
      });
    return allocate(model.txn.amountMinor, model.alreadyMinor, picks);
  }, [model, ordered, ticked, texts]);

  if (!model) {
    return (
      <View style={styles.root}>
        <Header title="Merge" caption="This transaction is gone." onCancel={close} />
      </View>
    );
  }

  const { txn, availableMinor } = model;
  const allocatedFor = new Map(plan.allocations.map((a) => [a.targetId, a.amountMinor]));
  const best = model.suggestion.bestId ? ordered.find((c) => c.id === model.suggestion.bestId) : undefined;
  const rest = ordered.filter((c) => c.id !== best?.id);
  const groups: { key: string; name: string; items: TargetCandidate[] }[] = [];
  for (const c of rest) {
    const g = groups.find((x) => x.key === c.groupKey);
    if (g) g.items.push(c);
    else groups.push({ key: c.groupKey, name: c.groupName, items: [c] });
  }

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const doSettle = () => {
    if (plan.allocations.length === 0) return;
    const kind = txn.direction === 'credit' ? 'share' : 'request';
    const names = new Map(ordered.map((c) => [c.id, c.groupName]));
    const picks = plan.allocations.map((a) => (kind === 'share' ? { shareId: a.targetId, amountMinor: a.amountMinor } : { requestId: a.targetId, amountMinor: a.amountMinor }));
    settleAndAnnounce({ transactionId: txn.id, picks }, kind, names);
    close();
  };

  const row = (c: TargetCandidate) => {
    const on = ticked.has(c.id);
    const shown = texts[c.id] ?? minorToRupeeText(allocatedFor.get(c.id) ?? Math.min(c.remainingMinor, availableMinor));
    return (
      <View key={c.id} style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          accessibilityLabel={`${c.groupName}${c.label ? `, ${c.label}` : ''}, owes ${formatRupees(c.remainingMinor)}`}
          onPress={() => toggle(c.id)}
          style={styles.rowMain}
        >
          <View style={[styles.check, on ? styles.checkOn : null]}>{on ? <Icon name="check" size={14} color="primaryInk" /> : null}</View>
          <View style={styles.rowText}>
            <ThemedText type="body" themeColor="text">
              {c.groupName}
            </ThemedText>
            <ThemedText type="caption" themeColor="text3">
              {[c.label, format(new Date(c.atMs), 'd MMM'), `${txn.direction === 'credit' ? 'owes' : 'you owe'} ${formatRupees(c.remainingMinor)}`].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
        </Pressable>
        {on ? (
          <View style={styles.cell}>
            <ThemedText type="label" themeColor="text3">
              ₹
            </ThemedText>
            <TextInput
              accessibilityLabel={`${c.groupName} amount`}
              value={shown}
              keyboardType="decimal-pad"
              selectTextOnFocus
              onChangeText={(t) => setTexts((prev) => ({ ...prev, [c.id]: t }))}
              style={styles.cellInput}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const caption = [txn.note?.trim() || txn.account || '', format(new Date(txn.occurredAt), 'd MMM')].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <Header title={`Merge ${formatRupees(txn.amountMinor)}`} caption={caption} onCancel={close} />
      <BottomSheetScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {ordered.length === 0 ? (
          <ThemedText type="body" themeColor="text3" style={styles.empty}>
            {txn.direction === 'credit' ? 'Nobody owes you anything right now.' : 'You don’t owe anyone right now.'}
          </ThemedText>
        ) : null}
        {best ? (
          <>
            <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
              SUGGESTED
            </ThemedText>
            {row(best)}
          </>
        ) : null}
        {groups.map((g) => (
          <View key={g.key}>
            <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
              {g.name.toUpperCase()}
            </ThemedText>
            {g.items.map(row)}
          </View>
        ))}
      </BottomSheetScrollView>
      <View style={styles.footer}>
        <ThemedText type="caption" themeColor="text3" style={styles.used}>
          {formatRupees(plan.allocatedMinor)} of {formatRupees(availableMinor)} used
        </ThemedText>
        <Button variant={plan.allocations.length > 0 ? 'primary' : 'disabled'} onPress={doSettle} style={styles.fullWidth}>
          Settle
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Starting from an item — pick the payment that settled it
// ---------------------------------------------------------------------------------------------------------------

function TargetToPayment({ params }: { params: MergeParams }) {
  const close = useSheetRegistry((s) => s.close);
  const [model] = useState(() => {
    const isRequest = !!params.requestId;
    const all = isRequest ? targetCandidates('debit') : targetCandidates('credit');
    const targets = all.filter((t) => (params.requestId ? t.id === params.requestId : params.shareId ? t.id === params.shareId : t.groupKey === params.personId));
    const totalOwedMinor = targets.reduce((a, t) => a + t.remainingMinor, 0);
    const payments = listPaymentCandidates(isRequest ? 'debit' : 'credit');
    const suggestion = suggestSettlement(
      { amountMinor: totalOwedMinor, account: null },
      payments.map((p) => ({ id: p.id, personName: p.account ?? '', remainingMinor: p.unallocatedMinor })),
    );
    return { kind: (isRequest ? 'request' : 'share') as SettleTargetKind, targets, totalOwedMinor, payments, suggestion };
  });
  const [picked, setPicked] = useState<string | null>(model.suggestion.bestId);

  const byId = new Map(model.payments.map((p) => [p.id, p]));
  const ordered = model.suggestion.orderedIds.map((id) => byId.get(id)).filter((p): p is PaymentCandidate => !!p);
  const who = model.targets[0]?.groupName ?? '';
  const title = model.kind === 'share' ? 'Mark as paid' : 'Record payment';
  const caption = model.targets.length === 0 ? 'Nothing is owed any more.' : `${who} · ${formatRupees(model.totalOwedMinor)} ${model.kind === 'share' ? 'owed' : 'you owe'}`;

  const doSettle = () => {
    if (!picked || model.targets.length === 0) return;
    const names = new Map(model.targets.map((t) => [t.id, t.groupName]));
    const picks = model.targets.map((t) => (model.kind === 'share' ? { shareId: t.id } : { requestId: t.id }));
    settleAndAnnounce({ transactionId: picked, picks }, model.kind, names);
    close();
  };

  return (
    <View style={styles.root}>
      <Header title={title} caption={caption} onCancel={close} />
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
          {model.kind === 'share' ? 'WHICH PAYMENT SETTLED IT?' : 'WHICH PAYMENT WAS IT?'}
        </ThemedText>
        {ordered.length === 0 ? (
          <ThemedText type="body" themeColor="text3" style={styles.empty}>
            {model.kind === 'share'
              ? 'No unmatched payment received yet. Add it as an income transaction, then merge it here.'
              : 'No unmatched payment made yet. Add it as an expense transaction, then merge it here.'}
          </ThemedText>
        ) : null}
        {ordered.map((p) => {
          const on = picked === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${p.note?.trim() || p.account || 'Payment'}, ${formatRupees(p.unallocatedMinor)}`}
              onPress={() => setPicked(on ? null : p.id)}
              style={styles.row}
            >
              <View style={[styles.check, on ? styles.checkOn : null]}>{on ? <Icon name="check" size={14} color="primaryInk" /> : null}</View>
              <View style={styles.rowText}>
                <ThemedText type="body" themeColor="text">
                  {p.note?.trim() || p.account || 'Payment'}
                </ThemedText>
                <ThemedText type="caption" themeColor="text3">
                  {[p.note?.trim() ? p.account : '', format(new Date(p.occurredAt), 'd MMM'), p.unallocatedMinor !== p.amountMinor ? `${formatRupees(p.unallocatedMinor)} of ${formatRupees(p.amountMinor)} left` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
              </View>
              <ThemedText type="body" themeColor="text">
                {formatRupees(p.unallocatedMinor)}
              </ThemedText>
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
      <View style={styles.footer}>
        <Button variant={picked && model.targets.length > 0 ? 'primary' : 'disabled'} onPress={doSettle} style={styles.fullWidth}>
          Settle
        </Button>
      </View>
    </View>
  );
}

function Header({ title, caption, onCancel }: { title: string; caption: string; onCancel: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <ThemedText type="title">{title}</ThemedText>
        {caption ? (
          <ThemedText type="caption" themeColor="text3">
            {caption}
          </ThemedText>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={onCancel}>
        <ThemedText type="label" themeColor="text2">
          Cancel
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  headerText: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four },
  sectionLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  empty: { paddingVertical: Spacing.four, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 58 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 58 },
  rowText: { flex: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.dark.text3, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  cell: {
    flexDirection: 'row', alignItems: 'center', minWidth: 96, minHeight: 40, paddingHorizontal: Spacing.three,
    borderRadius: Radius.control, backgroundColor: Colors.dark.surface2, gap: Spacing.one,
  },
  cellInput: { minWidth: 60, color: Colors.dark.text, fontFamily: fontFamily('display', 700), fontSize: 15, textAlign: 'right', paddingVertical: 0 },
  footer: {
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.dark.hairline,
  },
  used: { textAlign: 'center' },
  fullWidth: { width: '100%' },
});
