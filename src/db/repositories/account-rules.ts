/**
 * accountRuleRepo — SPEC-implementation.md §21.3 / §19.3 (F8). One rule per normalized
 * account key; last write wins. `upsertFromTransaction` runs after every insert/edit with
 * a non-empty account — from the UI and from the headless notification Save (no fork).
 */

import { desc, eq, like } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { normalizeAccount } from '@/domain/normalize';

import { db } from '../client';
import { accountRules, type AccountRule, type PaymentMethod } from '../schema';

export type RuleSource = {
  account: string;
  categoryId: string | null;
  /** true when the saved transaction's category is Uncategorized — keeps the learned one */
  categoryIsUncategorized: boolean;
  note: string | null;
  paymentMethod: PaymentMethod | null;
};

/** §19.3 upsert. `lastNote` is written as-is (an explicit `null` clears it, P-6). */
export function upsertFromTransaction(src: RuleSource): void {
  const account = src.account.trim();
  if (!account) return;
  const normalizedKey = normalizeAccount(account);
  if (!normalizedKey) return;
  const now = Date.now();

  const existing = db
    .select()
    .from(accountRules)
    .where(eq(accountRules.normalizedKey, normalizedKey))
    .get();

  if (!existing) {
    db.insert(accountRules)
      .values({
        normalizedKey,
        displayAccount: account,
        lastNote: src.note,
        categoryId: src.categoryIsUncategorized ? null : src.categoryId,
        lastPaymentMethod: src.paymentMethod,
        hitCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return;
  }

  db.update(accountRules)
    .set({
      displayAccount: account,
      hitCount: existing.hitCount + 1,
      lastNote: src.note,
      lastPaymentMethod: src.paymentMethod,
      // keep the previously learned category when the new save is Uncategorized
      categoryId: src.categoryIsUncategorized ? existing.categoryId : src.categoryId,
      updatedAt: now,
    })
    .where(eq(accountRules.normalizedKey, normalizedKey))
    .run();
}

export const upsertFromTransactionSync = upsertFromTransaction;

export function getAccountRule(normalizedKey: string): AccountRule | null {
  return (
    db.select().from(accountRules).where(eq(accountRules.normalizedKey, normalizedKey)).get() ?? null
  );
}

export const getAccountRuleSync = getAccountRule;

export function useAccountRules() {
  return useLiveQuery(db.select().from(accountRules).orderBy(desc(accountRules.hitCount)));
}

/** Prefix search for the Add/Edit/Confirmation account autocomplete (§6.5). */
export function searchByPrefix(prefix: string, limit = 8): AccountRule[] {
  const p = prefix.trim();
  if (!p) return [];
  return db
    .select()
    .from(accountRules)
    .where(like(accountRules.displayAccount, `${p}%`))
    .orderBy(desc(accountRules.hitCount))
    .limit(limit)
    .all();
}

export function updateAccountRule(
  normalizedKey: string,
  patch: { lastNote?: string | null; categoryId?: string | null },
): void {
  db.update(accountRules)
    .set({
      ...(patch.lastNote !== undefined ? { lastNote: patch.lastNote } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(accountRules.normalizedKey, normalizedKey))
    .run();
}

export function deleteAccountRule(normalizedKey: string): void {
  db.delete(accountRules).where(eq(accountRules.normalizedKey, normalizedKey)).run();
}
