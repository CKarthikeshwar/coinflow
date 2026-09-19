/**
 * FILE PURPOSE
 * ------------
 * Data access for `split` and `split_share` — a transaction shared between you and other people
 * (SPEC-implementation.md §39.2–§39.3 / §43.1, IMP-070/076/084/089, D36).
 *
 * Nothing about *your* share or any status is stored (D36): `getSplitForTransaction` derives them from the
 * transaction amount, the shares and the settlements, using the pure rules in `@/domain/split`.
 */

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getRandomBytes, randomUUID } from 'expo-crypto';

import { makeRef } from '@/domain/split-message';
import {
  recomputeYourShare,
  shareRemainingMinor,
  shareState,
  splitState,
  validateSplit,
  type ShareState,
  type SplitState,
} from '@/domain/split';

import { db } from '../client';
import { persons, splitShares, splits, transactions, type Person, type ShareRequestState, type Split, type SplitShare } from '../schema';
import { touchPersons } from './persons';
import { settledByShare } from './settlements';

export type ShareView = SplitShare & {
  person: Person;
  settledMinor: number;
  remainingMinor: number;
  state: ShareState;
  /** The last request said a different amount than the share now has. */
  changedSinceRequested: boolean;
};

export type SplitView = {
  split: Split;
  transactionAmountMinor: number;
  shares: ShareView[];
  /** amount − Σ all shares (waived ones included — you absorb those). */
  yourMinor: number;
  /** amount − Σ non-waived shares: what you actually spent. */
  effectiveMinor: number;
  state: SplitState;
};

function liveTransaction(id: string) {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();
}

function newRef(): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const ref = makeRef(() => getRandomBytes(1)[0]);
    if (!db.select({ id: splits.id }).from(splits).where(eq(splits.ref, ref)).get()) return ref;
  }
  throw new Error('could not generate a unique split reference');
}

function buildView(split: Split): SplitView | undefined {
  const txn = db.select().from(transactions).where(eq(transactions.id, split.transactionId)).get();
  if (!txn) return undefined;
  const rows = db
    .select({ share: splitShares, person: persons })
    .from(splitShares)
    .innerJoin(persons, eq(persons.id, splitShares.personId))
    .where(eq(splitShares.splitId, split.id))
    .orderBy(asc(splitShares.createdAt), asc(splitShares.id))
    .all();
  const settled = settledByShare(rows.map((r) => r.share.id));
  const shares = rows.map<ShareView>(({ share, person }) => {
    const settledMinor = settled.get(share.id) ?? 0;
    return {
      ...share,
      person,
      settledMinor,
      remainingMinor: shareRemainingMinor(share, settledMinor),
      state: shareState(share, settledMinor),
      changedSinceRequested: share.requestedAmountMinor != null && share.requestedAmountMinor !== share.amountMinor,
    };
  });
  const totalShares = shares.reduce((a, s) => a + s.amountMinor, 0);
  const nonWaived = shares.filter((s) => !s.waivedAt).reduce((a, s) => a + s.amountMinor, 0);
  return {
    split,
    transactionAmountMinor: txn.amountMinor,
    shares,
    yourMinor: txn.amountMinor - totalShares,
    effectiveMinor: Math.max(0, txn.amountMinor - nonWaived),
    state: splitState(shares.map((s) => s.state)),
  };
}

export function getSplit(id: string): SplitView | undefined {
  const split = db.select().from(splits).where(eq(splits.id, id)).get();
  return split ? buildView(split) : undefined;
}

export function getSplitForTransaction(transactionId: string): SplitView | undefined {
  const split = db.select().from(splits).where(eq(splits.transactionId, transactionId)).get();
  return split ? buildView(split) : undefined;
}

export function getSplitByRef(ref: string): SplitView | undefined {
  const split = db.select().from(splits).where(eq(splits.ref, ref)).get();
  return split ? buildView(split) : undefined;
}

export type ShareInput = { personId: string; amountMinor: number };

function assertShares(amountMinor: number, shares: readonly ShareInput[]) {
  const personIds = shares.map((s) => s.personId);
  if (new Set(personIds).size !== personIds.length) throw new RangeError('a person can only appear once in a split');
  const v = validateSplit(amountMinor, shares.map((s) => s.amountMinor));
  if (!v.ok) throw new RangeError(`invalid split: ${v.reason}`);
}

/**
 * Shares a transaction. One DB transaction: the split row, its shares and the "recently used" bump on the
 * people all land together or not at all. Throws `RangeError` for an invalid split (IMP-070) and `Error`
 * if the transaction is missing / deleted or already split.
 */
export function createSplit(
  input: { transactionId: string; shares: readonly ShareInput[]; ref?: string },
  now: number = Date.now(),
): SplitView {
  const splitId = db.transaction((tx) => {
    const txn = liveTransaction(input.transactionId);
    if (!txn) throw new Error('transaction not found');
    // CR-21: only money you paid OUT can be shared — a share is "what someone owes you", which has no meaning for an income.
    if (txn.direction !== 'debit') throw new RangeError('only a debit (money you paid out) can be split');
    if (tx.select({ id: splits.id }).from(splits).where(eq(splits.transactionId, txn.id)).get()) {
      throw new Error('transaction is already split');
    }
    assertShares(txn.amountMinor, input.shares);

    const id = randomUUID();
    tx.insert(splits).values({ id, ref: input.ref ?? newRef(), transactionId: txn.id, createdAt: now, updatedAt: now }).run();
    for (const s of input.shares) {
      tx.insert(splitShares)
        .values({ id: randomUUID(), splitId: id, personId: s.personId, amountMinor: s.amountMinor, createdAt: now, updatedAt: now })
        .run();
    }
    return id;
  });
  touchPersons(input.shares.map((s) => s.personId), now);
  return getSplit(splitId) as SplitView;
}

/**
 * Edit mode: makes the split's shares exactly `shares`. Existing people keep their share row (so their
 * request history and settlements stay); a changed amount may not drop below what is already settled;
 * removing a person who has settlements is refused. All-or-nothing.
 */
export function replaceShares(splitId: string, shares: readonly ShareInput[], now: number = Date.now()): SplitView {
  db.transaction((tx) => {
    const split = tx.select().from(splits).where(eq(splits.id, splitId)).get();
    if (!split) throw new Error('split not found');
    const txn = tx.select().from(transactions).where(eq(transactions.id, split.transactionId)).get();
    if (!txn) throw new Error('transaction not found');
    assertShares(txn.amountMinor, shares);

    const existing = tx.select().from(splitShares).where(eq(splitShares.splitId, splitId)).all();
    const settled = settledByShare(existing.map((s) => s.id));
    const wanted = new Map(shares.map((s) => [s.personId, s.amountMinor]));

    for (const row of existing) {
      const newAmount = wanted.get(row.personId);
      const settledMinor = settled.get(row.id) ?? 0;
      if (newAmount === undefined) {
        if (settledMinor > 0) throw new RangeError('cannot remove a person who has already paid');
        tx.delete(splitShares).where(eq(splitShares.id, row.id)).run();
      } else if (newAmount !== row.amountMinor) {
        if (newAmount < settledMinor) throw new RangeError('a share cannot be lowered below what is already settled');
        tx.update(splitShares).set({ amountMinor: newAmount, updatedAt: now }).where(eq(splitShares.id, row.id)).run();
      }
    }
    const haveIds = new Set(existing.map((r) => r.personId));
    for (const s of shares) {
      if (!haveIds.has(s.personId)) {
        tx.insert(splitShares)
          .values({ id: randomUUID(), splitId, personId: s.personId, amountMinor: s.amountMinor, createdAt: now, updatedAt: now })
          .run();
      }
    }
    tx.update(splits).set({ updatedAt: now }).where(eq(splits.id, splitId)).run();
  });
  touchPersons(shares.map((s) => s.personId), now);
  return getSplit(splitId) as SplitView;
}

/** Removes the split entirely (its shares and their settlements cascade; the settling transactions stay). */
export function removeSplit(splitId: string): void {
  db.delete(splits).where(eq(splits.id, splitId)).run();
}

/** You absorb this share (the person will not pay): it stops counting as owed and as a receivable. */
export function waiveShare(shareId: string, now: number = Date.now()): void {
  db.update(splitShares).set({ waivedAt: now, updatedAt: now }).where(eq(splitShares.id, shareId)).run();
}

export function unwaiveShare(shareId: string, now: number = Date.now()): void {
  db.update(splitShares).set({ waivedAt: null, updatedAt: now }).where(eq(splitShares.id, shareId)).run();
}

/** Records how sending a request went (`sent` / `failed` / `opened_in_sms_app`) and what amount it asked for. */
export function setShareRequestResult(
  shareId: string,
  state: ShareRequestState,
  requestedAmountMinor: number | null,
  now: number = Date.now(),
): void {
  db.update(splitShares)
    .set({
      requestState: state,
      requestSentAt: state === 'failed' ? null : now,
      ...(requestedAmountMinor != null && state !== 'failed' ? { requestedAmountMinor } : {}),
      updatedAt: now,
    })
    .where(eq(splitShares.id, shareId))
    .run();
}

/**
 * IMP-089 — may this split transaction's amount change to `newAmountMinor`? Other people's shares stay
 * fixed and your share is recomputed; not allowed if it would go negative. No split ⇒ always fine.
 */
export function validateAmountChange(
  transactionId: string,
  newAmountMinor: number,
): { ok: boolean; yourMinor: number | null } {
  const split = db.select().from(splits).where(eq(splits.transactionId, transactionId)).get();
  if (!split) return { ok: true, yourMinor: null };
  const amounts = db.select({ a: splitShares.amountMinor }).from(splitShares).where(eq(splitShares.splitId, split.id)).all();
  return recomputeYourShare(newAmountMinor, amounts.map((r) => r.a));
}

export type OwedItem = {
  shareId: string;
  splitId: string;
  transactionId: string;
  personId: string;
  personName: string;
  /** The shared transaction's note, else its account, else ''. */
  label: string;
  occurredAt: number;
  amountMinor: number;
  settledMinor: number;
  remainingMinor: number;
  state: ShareState;
  requestState: ShareRequestState;
};

/** Every share with money still owed to you (not waived, not settled, its transaction not deleted). */
export function listOpenShares(): OwedItem[] {
  const rows = db
    .select({ share: splitShares, person: persons, split: splits, txn: transactions })
    .from(splitShares)
    .innerJoin(persons, eq(persons.id, splitShares.personId))
    .innerJoin(splits, eq(splits.id, splitShares.splitId))
    .innerJoin(transactions, eq(transactions.id, splits.transactionId))
    .where(and(isNull(splitShares.waivedAt), isNull(transactions.deletedAt)))
    .orderBy(asc(transactions.occurredAt))
    .all();
  const settled = settledByShare(rows.map((r) => r.share.id));
  return rows
    .map<OwedItem>(({ share, person, split, txn }) => {
      const settledMinor = settled.get(share.id) ?? 0;
      return {
        shareId: share.id,
        splitId: split.id,
        transactionId: txn.id,
        personId: person.id,
        personName: person.displayName,
        label: txn.note || txn.account || '',
        occurredAt: txn.occurredAt,
        amountMinor: share.amountMinor,
        settledMinor,
        remainingMinor: shareRemainingMinor(share, settledMinor),
        state: shareState(share, settledMinor),
        requestState: share.requestState,
      };
    })
    .filter((i) => i.remainingMinor > 0);
}

export type OwedGroup = { personId: string; personName: string; totalMinor: number; items: OwedItem[] };

/** "Owed to you", grouped by person, largest outstanding first (Splits page, §6.19). */
export function listOwedByPerson(): OwedGroup[] {
  const byPerson = new Map<string, OwedGroup>();
  for (const item of listOpenShares()) {
    const g = byPerson.get(item.personId) ?? { personId: item.personId, personName: item.personName, totalMinor: 0, items: [] };
    g.totalMinor += item.remainingMinor;
    g.items.push(item);
    byPerson.set(item.personId, g);
  }
  return [...byPerson.values()].sort((a, b) => b.totalMinor - a.totalMinor || a.personName.localeCompare(b.personName));
}

/** Total still owed to you across all open shares. */
export function owedToYouMinor(): number {
  return listOpenShares().reduce((a, i) => a + i.remainingMinor, 0);
}

/** Splits that reference any of these transactions (used by list badges, phase 3). */
export function splitsForTransactions(transactionIds: readonly string[]): Map<string, SplitView> {
  const out = new Map<string, SplitView>();
  if (transactionIds.length === 0) return out;
  const rows = db.select().from(splits).where(inArray(splits.transactionId, [...transactionIds])).all();
  for (const split of rows) {
    const view = buildView(split);
    if (view) out.set(split.transactionId, view);
  }
  return out;
}

/** Count of splits (cheap existence check for the V1 fast path in analytics later). */
export function countSplits(): number {
  return Number(db.select({ n: sql<number>`count(*)` }).from(splits).get()?.n ?? 0);
}
