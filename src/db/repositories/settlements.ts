/**
 * FILE PURPOSE
 * ------------
 * Data access for `settlement` — "`amountMinor` of this transaction settled that share / request"
 * (SPEC-implementation.md §39.5 / §43.1, IMP-074/075/083, D37).
 *
 * - a **credit** (money in) settles **shares** people owe you;
 * - a **debit** (money out) settles **requests** you owe others (`split_request_in`, accepted ones);
 * - a Merge is **all or nothing**: `settle` writes every settlement in one DB transaction;
 * - what is not allocated stays an ordinary transaction — there is no leftover step (decided).
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { allocate } from '@/domain/settlement';

import { db } from '../client';
import {
  persons,
  settlements,
  splitRequestsIn,
  splitShares,
  splits,
  transactions,
  type Settlement,
} from '../schema';

export type SettlePick =
  | { shareId: string; requestId?: undefined; amountMinor?: number }
  | { requestId: string; shareId?: undefined; amountMinor?: number };

/** Σ of settlements per share id (missing id = nothing settled). */
export function settledByShare(shareIds: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (shareIds.length === 0) return out;
  const rows = db
    .select({ id: settlements.shareId, total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
    .from(settlements)
    .where(inArray(settlements.shareId, [...shareIds]))
    .groupBy(settlements.shareId)
    .all();
  for (const r of rows) if (r.id) out.set(r.id, Number(r.total));
  return out;
}

/** Σ of settlements per received-request id. */
export function settledByRequest(requestIds: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (requestIds.length === 0) return out;
  const rows = db
    .select({ id: settlements.requestId, total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
    .from(settlements)
    .where(inArray(settlements.requestId, [...requestIds]))
    .groupBy(settlements.requestId)
    .all();
  for (const r of rows) if (r.id) out.set(r.id, Number(r.total));
  return out;
}

/** Σ of everything already allocated out of one transaction. */
export function allocatedFromTransaction(transactionId: string): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
    .from(settlements)
    .where(eq(settlements.transactionId, transactionId))
    .get();
  return Number(row?.total ?? 0);
}

/**
 * Settles shares (credit) or requests (debit) with one transaction, atomically. `amountMinor` on a pick
 * defaults to "everything still owed"; the domain's `allocate` caps each pick by what is owed and by what is
 * left of the transaction. Returns the settlements created (keep their ids for Undo). Throws
 * `RangeError` for a wrong-direction pick, a waived / settled / unknown target, or when nothing can be
 * allocated — and in every throwing case writes nothing.
 */
export function settle(
  input: { transactionId: string; picks: readonly SettlePick[] },
  now: number = Date.now(),
): Settlement[] {
  return db.transaction((tx) => {
    const txn = tx
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, input.transactionId), isNull(transactions.deletedAt)))
      .get();
    if (!txn) throw new RangeError('transaction not found');
    if (input.picks.length === 0) throw new RangeError('nothing to settle');

    const wantShares = txn.direction === 'credit';
    const picks: { targetId: string; remainingMinor: number; requestedMinor?: number; kind: 'share' | 'request' }[] = [];

    for (const pick of input.picks) {
      if (wantShares) {
        if (!pick.shareId) throw new RangeError('a credit can only settle shares people owe you');
        const share = tx.select().from(splitShares).where(eq(splitShares.id, pick.shareId)).get();
        if (!share) throw new RangeError('share not found');
        if (share.waivedAt) throw new RangeError('share is waived');
        const owner = tx
          .select({ deletedAt: transactions.deletedAt })
          .from(splits)
          .innerJoin(transactions, eq(transactions.id, splits.transactionId))
          .where(eq(splits.id, share.splitId))
          .get();
        if (!owner || owner.deletedAt != null) throw new RangeError('the split’s transaction was deleted');
        const settled = Number(
          tx
            .select({ total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
            .from(settlements)
            .where(eq(settlements.shareId, share.id))
            .get()?.total ?? 0,
        );
        picks.push({ targetId: share.id, remainingMinor: Math.max(0, share.amountMinor - settled), requestedMinor: pick.amountMinor, kind: 'share' });
      } else {
        if (!pick.requestId) throw new RangeError('a debit can only settle requests you owe');
        const request = tx.select().from(splitRequestsIn).where(eq(splitRequestsIn.id, pick.requestId)).get();
        if (!request) throw new RangeError('request not found');
        if (request.status !== 'accepted') throw new RangeError('only an accepted request can be settled');
        const settled = Number(
          tx
            .select({ total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
            .from(settlements)
            .where(eq(settlements.requestId, request.id))
            .get()?.total ?? 0,
        );
        picks.push({ targetId: request.id, remainingMinor: Math.max(0, request.amountMinor - settled), requestedMinor: pick.amountMinor, kind: 'request' });
      }
    }

    const already = Number(
      tx
        .select({ total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
        .from(settlements)
        .where(eq(settlements.transactionId, txn.id))
        .get()?.total ?? 0,
    );
    const { allocations } = allocate(txn.amountMinor, already, picks);
    if (allocations.length === 0) throw new RangeError('nothing to settle');

    const created: Settlement[] = [];
    for (const a of allocations) {
      const row: Settlement = {
        id: randomUUID(),
        shareId: wantShares ? a.targetId : null,
        requestId: wantShares ? null : a.targetId,
        transactionId: txn.id,
        amountMinor: a.amountMinor,
        createdAt: now,
      };
      tx.insert(settlements).values(row).run();
      created.push(row);
    }
    return created;
  });
}

/** Undo for a Merge: deletes the given settlements. */
export function unsettle(ids: readonly string[]): void {
  if (ids.length === 0) return;
  db.delete(settlements).where(inArray(settlements.id, [...ids])).run();
}

export type SettlementLine = Settlement & {
  /** Who it settled — the person on the share, or the requester. */
  counterpartName: string;
  /** What it settled — the shared transaction's note/account, or the request's note. */
  label: string;
  kind: 'share' | 'request';
};

/** Everything one transaction has settled (Details › "Settlements"). */
export function listSettlementsForTransaction(transactionId: string): SettlementLine[] {
  const shareLines = db
    .select({
      s: settlements,
      name: persons.displayName,
      note: transactions.note,
      account: transactions.account,
    })
    .from(settlements)
    .innerJoin(splitShares, eq(splitShares.id, settlements.shareId))
    .innerJoin(persons, eq(persons.id, splitShares.personId))
    .innerJoin(splits, eq(splits.id, splitShares.splitId))
    .innerJoin(transactions, eq(transactions.id, splits.transactionId))
    .where(eq(settlements.transactionId, transactionId))
    .all()
    .map<SettlementLine>((r) => ({ ...r.s, counterpartName: r.name, label: r.note || r.account || '', kind: 'share' }));

  const requestLines = db
    .select({ s: settlements, name: splitRequestsIn.fromLabel, note: splitRequestsIn.forNote })
    .from(settlements)
    .innerJoin(splitRequestsIn, eq(splitRequestsIn.id, settlements.requestId))
    .where(eq(settlements.transactionId, transactionId))
    .all()
    .map<SettlementLine>((r) => ({ ...r.s, counterpartName: r.name, label: r.note ?? '', kind: 'request' }));

  return [...shareLines, ...requestLines].sort((a, b) => a.createdAt - b.createdAt);
}

export type PaymentCandidate = {
  id: string;
  direction: 'credit' | 'debit';
  amountMinor: number;
  /** What is still unallocated (amount − Σ settlements). Always > 0. */
  unallocatedMinor: number;
  note: string | null;
  account: string | null;
  occurredAt: number;
};

/**
 * Transactions that could still settle something — the Merge sheet's list when it starts from a share / request
 * ("which payment settled this?", SPEC-UI-UX §6.20 as built, CR-10). A credit can settle shares people owe you,
 * a debit can settle requests you owe; only ones with an unallocated remainder are returned, newest first.
 */
export function listPaymentCandidates(direction: 'credit' | 'debit', limit = 60): PaymentCandidate[] {
  const rows = db
    .select({
      id: transactions.id,
      direction: transactions.direction,
      amountMinor: transactions.amountMinor,
      note: transactions.note,
      account: transactions.account,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(and(eq(transactions.direction, direction), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.occurredAt))
    .all();
  const allocated = new Map(
    db
      .select({ id: settlements.transactionId, total: sql<number>`coalesce(sum(${settlements.amountMinor}), 0)` })
      .from(settlements)
      .groupBy(settlements.transactionId)
      .all()
      .map((r) => [r.id, Number(r.total)] as const),
  );
  return rows
    .map<PaymentCandidate>((r) => ({ ...r, unallocatedMinor: r.amountMinor - (allocated.get(r.id) ?? 0) }))
    .filter((r) => r.unallocatedMinor > 0)
    .slice(0, limit);
}
