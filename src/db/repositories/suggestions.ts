/**
 * FILE PURPOSE
 * ------------
 * The `suggestionRepo` — manages the `suggestions` table, which holds transactions the app
 * *detected* from an SMS but the user hasn't confirmed yet. A suggestion is a "draft"; it only
 * becomes a real `transactions` row once the user confirms it.
 *
 * WHERE IT FITS
 * -------------
 * `insertIfNew` is called by `src/services/tasks/sms-ingest.ts` — the headless background task
 * that runs when a new SMS arrives — right after `parseSms` (`src/domain/parser/`) successfully
 * reads a transaction out of the message. From there, a suggestion is either:
 *   - confirmed (`confirmSuggestion`) when the user taps "Save" on the notification or in the
 *     Review Queue — this runs in the SAME database transaction as the actual transaction
 *     insert, so a suggestion is never left "confirmed" without a matching transaction, or
 *     vice versa (see `src/services/notifications/respond.ts` and
 *     `src/features/transactions/write-confirmed-transaction.ts`).
 *   - dismissed (`dismissSuggestion`) when the user swipes it away or taps "Discard" — this is
 *     a genuine, immediate DELETE, unlike a transaction's soft-delete.
 *
 * USED BY
 * -------
 * `src/services/tasks/sms-ingest.ts` (create), `src/app/review-queue.tsx` (list/dismiss),
 * `src/services/notifications/respond.ts` (confirm/dismiss from a notification tap).
 *
 * IMPORTANT
 * ---------
 * - `insertIfNew` relies on a unique database index on `dedupeKey` (`uniq_sugg_dedupe` in
 *   `schema.ts`) plus `ON CONFLICT DO NOTHING` to guarantee the exact same SMS can never create
 *   two suggestions, even if the background task somehow runs twice for the same message.
 * - A `confirmed` suggestion isn't deleted immediately — it's kept around briefly so a
 *   notification the user taps late (after already confirming elsewhere, or on another device
 *   in theory) can still be routed sensibly instead of pointing at nothing. It's cleaned up
 *   later by `src/db/maintenance.ts`'s `purge()`.
 * - Every function here is called identically from the UI and from the headless background
 *   task — same reason as `transactions.ts`: the database driver is synchronous, so there's no
 *   separate async path to keep in sync.
 */

import { and, count, desc, eq, lt } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { suggestions, type Direction, type PaymentMethod, type Suggestion } from '../schema';

export type InsertSuggestionInput = {
  amountMinor?: number | null;
  direction?: Direction | null;
  occurredAt?: number | null;
  account?: string | null;
  normalizedKey?: string | null;
  paymentMethod?: PaymentMethod | null;
  smsSender: string;
  smsReceivedAt: number;
  dedupeKey: string;
};

/** §17.3 step 5 — relies on `uniq_sugg_dedupe` + ON CONFLICT DO NOTHING. */
export function insertIfNew(input: InsertSuggestionInput): { created: boolean; id: string } {
  const existing = db
    .select({ id: suggestions.id })
    .from(suggestions)
    .where(eq(suggestions.dedupeKey, input.dedupeKey))
    .get();
  if (existing) return { created: false, id: existing.id };

  const id = randomUUID();
  const res = db
    .insert(suggestions)
    .values({
      id,
      amountMinor: input.amountMinor ?? null,
      direction: input.direction ?? null,
      occurredAt: input.occurredAt ?? null,
      account: input.account ?? null,
      normalizedKey: input.normalizedKey ?? null,
      paymentMethod: input.paymentMethod ?? null,
      smsSender: input.smsSender,
      smsReceivedAt: input.smsReceivedAt,
      dedupeKey: input.dedupeKey,
      status: 'pending',
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: suggestions.dedupeKey })
    .run();

  if ((res.changes ?? 0) === 0) {
    const row = db.select({ id: suggestions.id }).from(suggestions).where(eq(suggestions.dedupeKey, input.dedupeKey)).get();
    return { created: false, id: row?.id ?? id };
  }
  return { created: true, id };
}

export function getSuggestion(id: string): Suggestion | null {
  return db.select().from(suggestions).where(eq(suggestions.id, id)).get() ?? null;
}

/** Called inside the same DB transaction as the transaction insert (§17.4b / §6.4). */
export function confirmSuggestion(id: string, transactionId: string): void {
  db.update(suggestions)
    .set({ status: 'confirmed', confirmedTransactionId: transactionId })
    .where(eq(suggestions.id, id))
    .run();
}

/** Hard DELETE (D26) — notification Discard + Review Queue swipe. */
export function dismissSuggestion(id: string): void {
  db.delete(suggestions).where(eq(suggestions.id, id)).run();
}

export function dismissAllPending(): number {
  const res = db.delete(suggestions).where(eq(suggestions.status, 'pending')).run();
  return res.changes ?? 0;
}

export function usePendingSuggestions() {
  return useLiveQuery(
    db
      .select()
      .from(suggestions)
      .where(eq(suggestions.status, 'pending'))
      .orderBy(desc(suggestions.createdAt)),
  );
}

export function usePendingCount() {
  const q = useLiveQuery(
    db.select({ n: count() }).from(suggestions).where(eq(suggestions.status, 'pending')),
  );
  return { ...q, count: q.data[0]?.n ?? 0 };
}

/** Sync count for the headless posting/reconcile path (§31.4/§31.8) — no live query there. */
export function countPending(): number {
  const row = db
    .select({ n: count() })
    .from(suggestions)
    .where(eq(suggestions.status, 'pending'))
    .get();
  return row?.n ?? 0;
}

/** Sync list for `reconcileNotifications` (§31.8) — no live query in a headless/bootstrap context. */
export function listPending(): Suggestion[] {
  return db
    .select()
    .from(suggestions)
    .where(eq(suggestions.status, 'pending'))
    .orderBy(desc(suggestions.createdAt))
    .all();
}

export function purgeConfirmed(before: number): void {
  db.delete(suggestions)
    .where(and(eq(suggestions.status, 'confirmed'), lt(suggestions.createdAt, before)))
    .run();
}

