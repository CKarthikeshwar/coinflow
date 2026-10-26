/**
 * FILE PURPOSE
 * ------------
 * The `transferRepo` — money moved between two of the user's own accounts (SPEC-implementation.md §46.6, D43).
 * A transfer is two rows, one per account, both `type: 'transfer'`, pointing at each other through `transferPeerId`
 * (no FK — this file keeps the pair consistent). Analytics only ever sum `type IN ('expense','income')`, so a linked
 * pair drops out of Spending / Income / categories with no query change.
 *
 * Three ways a pair comes to exist:
 *   - `createTransfer` — the Add sheet's Transfer segment (UI-105); the pair is inserted atomically.
 *   - `linkTransferIfAny` — after any save of a row with an account: an unambiguous twin is linked automatically
 *     (D47, UI-106). An ambiguous one becomes a **Looks like a transfer?** Review card (`listTransferHints`, derived
 *     on read — no table; a "No" is remembered in `app_setting`).
 *   - **Card-bill hint** (UI-108) — a bank debit whose SMS said it paid one of your cards. The body is never stored,
 *     so ingest records the hint against the suggestion's `dedupeKey` (`recordCardBillHint`); "Yes" turns the saved
 *     debit into a single-sided transfer.
 *
 * The invariant (tested): a row with a `transferPeerId` has a peer that points back and has the opposite direction.
 */

import { and, eq, gte, inArray, isNull, like, lt } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';

import { matchTransfer, pairKey, type TransferMatch, type TransferRow } from '@/domain/accounts/transfers';
import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { appSettings, transactions, type Transaction } from '../schema';
import { getSetting, setSetting } from './settings';

/** How far back the Review Queue looks for "Looks like a transfer?" (§46.6). */
export const TRANSFER_HINT_LOOKBACK_MS = 48 * 60 * 60_000;
/** Card-bill hints older than this are dropped. */
export const CARD_BILL_HINT_TTL_MS = 30 * 24 * 60 * 60_000;

const DISMISSED_PREFIX = 'transferHintDismissed:';
const CARD_BILL_PREFIX = 'cardBillHint:';

function asTransferRow(t: Transaction): TransferRow {
  return {
    id: t.id,
    amountMinor: t.amountMinor,
    direction: t.direction,
    type: t.type,
    accountId: t.accountId,
    occurredAt: t.occurredAt,
    source: t.source,
    transferPeerId: t.transferPeerId,
    deletedAt: t.deletedAt,
  };
}

function plainType(direction: Transaction['direction']): 'expense' | 'income' {
  return direction === 'credit' ? 'income' : 'expense';
}

export type CreateTransferInput = {
  fromId: string;
  toId: string;
  amountMinor: number;
  occurredAt: number;
  note?: string | null;
};

/** UI-105 — a debit on From and a credit on To, linked, in one write. */
export function createTransfer(input: CreateTransferInput): { outId: string; inId: string } {
  if (input.fromId === input.toId) throw new Error('createTransfer: From and To must differ');
  if (input.amountMinor <= 0) throw new Error('createTransfer: amount must be positive');
  const outId = randomUUID();
  const inId = randomUUID();
  const now = Date.now();
  const note = input.note?.trim() || null;
  const base = {
    amountMinor: input.amountMinor,
    type: 'transfer' as const,
    categoryId: null,
    paymentMethod: null,
    account: null,
    normalizedAccountKey: null,
    note,
    description: null,
    searchText: (note ?? '').toLowerCase(),
    occurredAt: input.occurredAt,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    source: 'manual' as const,
    smsSender: null,
    smsReceivedAt: null,
    dedupeKey: null,
    editedByUser: false,
  };
  db.transaction((tx) => {
    tx.insert(transactions)
      .values({ ...base, id: outId, direction: 'debit', accountId: input.fromId, transferPeerId: inId })
      .run();
    tx.insert(transactions)
      .values({ ...base, id: inId, direction: 'credit', accountId: input.toId, transferPeerId: outId })
      .run();
  });
  return { outId, inId };
}

/** Both rows become one transfer: `type: 'transfer'`, no category, each pointing at the other. */
export function linkPair(aId: string, bId: string): void {
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(transactions)
      .set({ type: 'transfer', categoryId: null, transferPeerId: bId, updatedAt: now })
      .where(eq(transactions.id, aId))
      .run();
    tx.update(transactions)
      .set({ type: 'transfer', categoryId: null, transferPeerId: aId, updatedAt: now })
      .where(eq(transactions.id, bId))
      .run();
  });
}

function candidatesNear(row: Transaction): Transaction[] {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        isNull(transactions.transferPeerId),
        eq(transactions.amountMinor, row.amountMinor),
        gte(transactions.occurredAt, row.occurredAt - 15 * 60_000),
        lt(transactions.occurredAt, row.occurredAt + 15 * 60_000 + 1),
      ),
    )
    .all();
}

/**
 * §46.6 auto-link hook — run after a row with an account is inserted / confirmed. `link` ⇒ the pair is linked now
 * (the caller shows "Linked as a transfer · Undo"); `ask` ⇒ nothing is written, the Review Queue derives the card.
 */
export function linkTransferIfAny(txnId: string): TransferMatch {
  const row = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
  if (!row || !row.accountId) return { kind: 'none' };
  const result = matchTransfer(asTransferRow(row), candidatesNear(row).map(asTransferRow));
  if (result.kind === 'link') {
    if (isHintDismissed(row.id, result.peer.id)) return { kind: 'none' };
    linkPair(row.id, result.peer.id);
  }
  return result;
}

/**
 * Unlink (UI-106): each side goes back to an expense (debit) or income (credit), uncategorised. Also works on a
 * single-sided transfer (bill payment) and on a row whose other half was deleted.
 */
export function unlinkTransfer(txnId: string): void {
  const row = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
  if (!row) return;
  const now = Date.now();
  db.transaction((tx) => {
    for (const id of [row.id, row.transferPeerId].filter((x): x is string => !!x)) {
      const r = tx.select().from(transactions).where(eq(transactions.id, id)).get();
      if (!r) continue;
      tx.update(transactions)
        .set({ type: plainType(r.direction), transferPeerId: null, categoryId: null, updatedAt: now })
        .where(eq(transactions.id, id))
        .run();
    }
  });
  // an unlinked pair must not be re-offered as "Looks like a transfer?" straight away
  if (row.transferPeerId) dismissTransferHint(row.id, row.transferPeerId);
}

export type UpdateTransferInput = {
  amountMinor: number;
  occurredAt: number;
  note: string | null;
  fromId: string | null;
  toId: string | null;
};

/**
 * Edit a transfer from the sheet's Transfer segment: both rows move together (amount, date, note) and each keeps its
 * side — the debit on From, the credit on To. A single-sided transfer only has the debit.
 */
export function updateTransfer(txnId: string, input: UpdateTransferInput): void {
  const row = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
  if (!row) return;
  const peer = row.transferPeerId
    ? db.select().from(transactions).where(eq(transactions.id, row.transferPeerId)).get()
    : undefined;
  const debit = row.direction === 'debit' ? row : peer;
  const credit = row.direction === 'credit' ? row : peer;
  const note = input.note?.trim() || null;
  const now = Date.now();
  db.transaction((tx) => {
    const common = {
      amountMinor: input.amountMinor,
      occurredAt: input.occurredAt,
      note,
      searchText: `${note ?? ''}`.toLowerCase(),
      editedByUser: true,
      updatedAt: now,
    };
    if (debit) tx.update(transactions).set({ ...common, accountId: input.fromId }).where(eq(transactions.id, debit.id)).run();
    if (credit) tx.update(transactions).set({ ...common, accountId: input.toId }).where(eq(transactions.id, credit.id)).run();
  });
}

/** Delete a transfer: both rows together, with the same `deletedAt` so Undo (`restoreTransaction`) brings back both. */
export function softDeleteTransfer(txnId: string): void {
  const row = db.select().from(transactions).where(eq(transactions.id, txnId)).get();
  if (!row) return;
  const now = Date.now();
  const ids = [row.id, row.transferPeerId].filter((x): x is string => !!x);
  db.update(transactions).set({ deletedAt: now, updatedAt: now }).where(inArray(transactions.id, ids)).run();
}

// --- "Looks like a transfer?" (derived) ---------------------------------------------------------

export type TransferHint = { outRow: Transaction; inRow: Transaction };

function isHintDismissed(a: string, b: string): boolean {
  return getSetting<boolean>(`${DISMISSED_PREFIX}${pairKey(a, b)}`, false);
}

/** The "No" on a Review card — that pair is never offered (or auto-linked) again. */
export function dismissTransferHint(a: string, b: string): void {
  setSetting(`${DISMISSED_PREFIX}${pairKey(a, b)}`, true);
}

/** Pure: the pairs among `recent` (un-linked, not deleted) that the user has not said "No" to. */
export function deriveTransferHints(recent: readonly Transaction[], dismissedKeys: ReadonlySet<string>): TransferHint[] {
  const byId = new Map(recent.map((r) => [r.id, r]));
  const rows = recent.map(asTransferRow);
  const hints: TransferHint[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.direction !== 'debit') continue;
    const match = matchTransfer(r, rows);
    const peers = match.kind === 'link' ? [match.peer] : match.kind === 'ask' ? match.peers : [];
    for (const p of peers) {
      const key = pairKey(r.id, p.id);
      if (seen.has(key) || dismissedKeys.has(`${DISMISSED_PREFIX}${key}`)) continue;
      seen.add(key);
      hints.push({ outRow: byId.get(r.id)!, inRow: byId.get(p.id)! });
    }
  }
  return hints;
}

function recentUnlinkedQuery(now: number) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        isNull(transactions.transferPeerId),
        gte(transactions.occurredAt, now - TRANSFER_HINT_LOOKBACK_MS),
      ),
    );
}

function dismissedKeysQuery() {
  return db.select({ key: appSettings.key }).from(appSettings).where(like(appSettings.key, `${DISMISSED_PREFIX}%`));
}

/** §46.6 — "Looks like a transfer?" pairs from the last 48 h (sync, for tests / headless use). */
export function listTransferHints(now: number = Date.now()): TransferHint[] {
  const dismissed = new Set(dismissedKeysQuery().all().map((r) => r.key));
  return deriveTransferHints(recentUnlinkedQuery(now).all(), dismissed);
}

/** Live version for the Review Queue. The 48 h window is anchored when the screen mounts. */
export function useTransferHints(): TransferHint[] {
  const [now] = useState(() => Date.now());
  const rows = useLiveQuery(recentUnlinkedQuery(now), [now]);
  const dismissed = useLiveQuery(dismissedKeysQuery());
  return deriveTransferHints(rows.data, new Set(dismissed.data.map((r) => r.key)));
}

// --- card-bill hints (UI-108) --------------------------------------------------------------------

/** At ingest: this SMS (by its suggestion's `dedupeKey`) paid the card account `cardAccountId`. */
export function recordCardBillHint(dedupeKey: string, cardAccountId: string): void {
  setSetting(`${CARD_BILL_PREFIX}${dedupeKey}`, cardAccountId);
}

export type CardBillHint = { row: Transaction; cardAccountId: string; dedupeKey: string };

function cardBillKeysQuery(now: number) {
  return db
    .select()
    .from(appSettings)
    .where(and(like(appSettings.key, `${CARD_BILL_PREFIX}%`), gte(appSettings.updatedAt, now - CARD_BILL_HINT_TTL_MS)));
}

function hintedRowsQuery(dedupeKeys: string[]) {
  return db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.dedupeKey, dedupeKeys.length ? dedupeKeys : ['']),
        isNull(transactions.deletedAt),
        isNull(transactions.transferPeerId),
        eq(transactions.type, 'expense'),
      ),
    );
}

function joinCardBillHints(keys: readonly { key: string; value: string }[], rows: readonly Transaction[]): CardBillHint[] {
  const byKey = new Map(keys.map((k) => [k.key.slice(CARD_BILL_PREFIX.length), JSON.parse(k.value) as string]));
  return rows
    .filter((row) => row.dedupeKey && byKey.has(row.dedupeKey))
    .map((row) => ({ row, cardAccountId: byKey.get(row.dedupeKey!)!, dedupeKey: row.dedupeKey! }));
}

export function listCardBillHints(now: number = Date.now()): CardBillHint[] {
  const keys = cardBillKeysQuery(now).all();
  if (keys.length === 0) return [];
  const dedupeKeys = keys.map((k) => k.key.slice(CARD_BILL_PREFIX.length));
  return joinCardBillHints(keys, hintedRowsQuery(dedupeKeys).all());
}

export function useCardBillHints(): CardBillHint[] {
  const [now] = useState(() => Date.now());
  const keys = useLiveQuery(cardBillKeysQuery(now), [now]);
  const dedupeKeys = keys.data.map((k) => k.key.slice(CARD_BILL_PREFIX.length));
  const rows = useLiveQuery(hintedRowsQuery(dedupeKeys), [dedupeKeys.join('|')]);
  return joinCardBillHints(keys.data, rows.data);
}

/** "Yes, bill payment": the debit becomes a single-sided transfer (no peer) — no longer spending. */
export function acceptCardBillHint(hint: Pick<CardBillHint, 'row' | 'dedupeKey'>): void {
  db.update(transactions)
    .set({ type: 'transfer', categoryId: null, updatedAt: Date.now() })
    .where(eq(transactions.id, hint.row.id))
    .run();
  clearCardBillHint(hint.dedupeKey);
}

export function clearCardBillHint(dedupeKey: string): void {
  db.delete(appSettings).where(eq(appSettings.key, `${CARD_BILL_PREFIX}${dedupeKey}`)).run();
}

/** Maintenance: drop card-bill hints past their TTL. */
export function purgeStaleCardBillHints(now: number = Date.now()): void {
  db.delete(appSettings)
    .where(and(like(appSettings.key, `${CARD_BILL_PREFIX}%`), lt(appSettings.updatedAt, now - CARD_BILL_HINT_TTL_MS)))
    .run();
}

/** id → accountId for the other halves of the given rows (list rows show "SBI ··1234 → HDFC ··672"). */
export function usePeerAccounts(peerIds: readonly string[]): Map<string, string | null> {
  const ids = [...new Set(peerIds)].sort();
  const q = useLiveQuery(
    db
      .select({ id: transactions.id, accountId: transactions.accountId })
      .from(transactions)
      .where(inArray(transactions.id, ids.length ? ids : [''])),
    [ids.join('|')],
  );
  return new Map(q.data.map((r) => [r.id, r.accountId]));
}
