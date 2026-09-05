/**
 * FILE PURPOSE
 * ------------
 * The `accountRuleRepo` — this is the app's "memory" of what you usually do for a given bank
 * account/merchant. Every time you save a transaction with an account attached, this records
 * (or updates) the category/note/payment method you picked, keyed by the account's normalized
 * form (see `src/domain/normalize.ts`). Next time a transaction comes in from that same
 * account, that memory is what lets the app pre-fill the category instead of leaving it blank.
 *
 * WHERE IT FITS
 * -------------
 * `upsertFromTransaction` is called after EVERY transaction insert/edit that has a non-empty
 * account — both from the UI (Add/Confirm/Edit sheets) and from the headless "Save" action a
 * user can tap directly on a notification without opening the app. Both paths call the exact
 * same function, so the learned rule updates identically either way, and there's no separate
 * "notification version" of this logic to keep in sync.
 *
 * USED BY
 * -------
 * - `src/features/transactions/write-confirmed-transaction.ts` — writes the rule after saving.
 * - `src/services/notifications/respond.ts` — writes the rule after a notification "Save".
 * - `src/domain/categorize.ts` — reads a rule (via `getAccountRule`) to decide whether an
 *   incoming SMS-detected transaction is from a "known" account (safe to one-tap-save) or a
 *   "new" one (needs manual review).
 * - `src/features/transactions/transaction-sheet.tsx` — reads a rule to pre-fill the sheet, and
 *   `searchByPrefix` powers the account-name autocomplete while typing.
 *
 * IMPORTANT
 * ---------
 * There's exactly one rule per normalized account key — "last write wins." If you save a
 * transaction for an account with a different category than last time, the rule updates to the
 * new category; there's no history of past choices, only the most recent one. The one
 * exception: if the new save is left Uncategorized, the previously learned category is kept
 * rather than being overwritten with "no category" — see the `categoryIsUncategorized` handling
 * in `upsertFromTransaction`.
 */

import { desc, eq, like } from 'drizzle-orm';

import { normalizeAccount } from '@/domain/normalize';
import { useLiveQuery } from '@/hooks/use-live-query';

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

export function getAccountRule(normalizedKey: string): AccountRule | null {
  return (
    db.select().from(accountRules).where(eq(accountRules.normalizedKey, normalizedKey)).get() ?? null
  );
}

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
