/**
 * suggestionRepo — SPEC-implementation.md §21.4 / §19.4. Dismiss is a hard DELETE (D26);
 * `confirmed` rows linger briefly for stale-notification routing (§10) and are purged by
 * §20.6. `insertIfNew` + `confirmSuggestion` + `dismissSuggestion` run from the headless
 * SMS pipeline and share their implementation with the UI.
 */

import { and, count, desc, eq, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';

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

export const insertIfNewSync = insertIfNew;

export function getSuggestion(id: string): Suggestion | null {
  return db.select().from(suggestions).where(eq(suggestions.id, id)).get() ?? null;
}

export const getSuggestionSync = getSuggestion;

/** Called inside the same DB transaction as the transaction insert (§17.4b / §6.4). */
export function confirmSuggestion(id: string, transactionId: string): void {
  db.update(suggestions)
    .set({ status: 'confirmed', confirmedTransactionId: transactionId })
    .where(eq(suggestions.id, id))
    .run();
}

export const confirmSuggestionSync = confirmSuggestion;

/** Hard DELETE (D26) — notification Discard + Review Queue swipe. */
export function dismissSuggestion(id: string): void {
  db.delete(suggestions).where(eq(suggestions.id, id)).run();
}

export const dismissSuggestionSync = dismissSuggestion;

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

export function purgeConfirmed(before: number): void {
  db.delete(suggestions)
    .where(and(eq(suggestions.status, 'confirmed'), lt(suggestions.createdAt, before)))
    .run();
}

export const purgeConfirmedSync = purgeConfirmed;
