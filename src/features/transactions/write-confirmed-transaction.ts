/**
 * FILE PURPOSE
 * ------------
 * Turns the Add/Confirm/Edit sheet's in-progress draft (`src/stores/add-sheet-draft.ts`) into
 * actual database writes. This is where the UI form's data finally becomes a real
 * `transactions` row — everything before this point in the sheet is just editing local state.
 *
 * WHERE IT FITS
 * -------------
 * Called by `src/features/transactions/transaction-sheet.tsx` when the user taps the primary
 * button. `writeConfirmedTransaction` handles both `'add'` (a brand-new manual transaction) and
 * `'confirm'` (turning an SMS-detected suggestion into a real transaction) — both need to
 * insert a new transaction row, and `'confirm'` additionally needs to mark the source
 * suggestion as confirmed. `writeEditedTransaction` handles `'edit'` — updating a transaction
 * that already exists, using `updateTransaction` from `src/db/repositories/transactions.ts`.
 *
 * IMPORTANT — a deliberate duplication, not an oversight
 * -----------------------------------------------------------
 * `writeConfirmedTransaction` re-implements the "learn this account" upsert logic inline
 * (the block that inserts/updates an `accountRules` row) instead of calling the shared
 * `upsertFromTransaction` helper in `src/db/repositories/account-rules.ts`, even though
 * `writeEditedTransaction` right below it DOES call that shared helper. This isn't
 * inconsistency for its own sake: `writeConfirmedTransaction` needs the transaction insert,
 * the suggestion-confirm, and the account-rule learn step to all happen inside ONE atomic
 * `db.transaction(...)` call (so a crash partway through can't leave a confirmed suggestion
 * with no matching transaction, for example) — but the shared `upsertFromTransaction` helper
 * always runs its own queries against the top-level `db` object, not whatever `tx` a caller
 * might be inside, so it can't be called from within this function's transaction block.
 * `writeEditedTransaction` doesn't have that constraint (its own database write isn't wrapped in
 * an explicit transaction the same way), so it's free to reuse the shared helper normally.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/client';
import { upsertFromTransaction } from '@/db/repositories/account-rules';
import { updateTransaction } from '@/db/repositories/transactions';
import { accountRules, suggestions, transactions } from '@/db/schema';
import { normalizeAccount } from '@/domain/normalize';
import type { AddSheetDraft } from '@/stores/add-sheet-draft';

export type SmsRef = { sender: string; receivedAt: number; dedupeKey: string } | null;

export function writeConfirmedTransaction(draft: AddSheetDraft, smsRef: SmsRef): { transactionId: string } {
  const transactionId = randomUUID();
  const now = Date.now();
  const account = draft.account.trim() || null;
  const note = draft.note.trim() || null;
  const description = draft.description.trim() || null;
  const normalizedAccountKey = account ? normalizeAccount(account) : null;
  const categoryId = draft.direction === 'credit' ? null : draft.categoryId; // IMP-011
  const categoryIsUncategorized = categoryId === null;

  db.transaction((tx) => {
    tx.insert(transactions)
      .values({
        id: transactionId,
        amountMinor: draft.amountMinor,
        direction: draft.direction,
        type: draft.type,
        categoryId,
        paymentMethod: draft.paymentMethod,
        account,
        normalizedAccountKey,
        note,
        description,
        searchText: `${note ?? ''} ${description ?? ''} ${account ?? ''}`
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim(),
        occurredAt: draft.occurredAt,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        source: smsRef ? 'sms' : 'manual',
        smsSender: smsRef?.sender ?? null,
        smsReceivedAt: smsRef?.receivedAt ?? null,
        dedupeKey: smsRef?.dedupeKey ?? null,
        editedByUser: draft.mode === 'confirm',
      })
      .run();

    if (draft.mode === 'confirm' && draft.sourceId) {
      tx.update(suggestions)
        .set({ status: 'confirmed', confirmedTransactionId: transactionId })
        .where(eq(suggestions.id, draft.sourceId))
        .run();
    }

    // §25.2 — the learning step, same transaction.
    if (account && normalizedAccountKey) {
      const existing = tx
        .select()
        .from(accountRules)
        .where(eq(accountRules.normalizedKey, normalizedAccountKey))
        .get();

      if (!existing) {
        tx.insert(accountRules)
          .values({
            normalizedKey: normalizedAccountKey,
            displayAccount: account,
            lastNote: note,
            categoryId,
            lastPaymentMethod: draft.paymentMethod,
            hitCount: 1,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } else {
        tx.update(accountRules)
          .set({
            displayAccount: account,
            hitCount: existing.hitCount + 1,
            lastNote: note,
            lastPaymentMethod: draft.paymentMethod,
            // keep the previously learned category when this save is Uncategorized (§25.2)
            categoryId: categoryIsUncategorized ? existing.categoryId : categoryId,
            updatedAt: now,
          })
          .where(eq(accountRules.normalizedKey, normalizedAccountKey))
          .run();
      }
    }
  });

  return { transactionId };
}

/**
 * §6.6/§30.8 Edit — identical fields to Add, but updates the existing row (`draft.sourceId`, the
 * transaction id) instead of inserting a new one, then upserts the `AccountRule` the same as
 * Add/Confirm (§30.8: "`updateTransaction` (+ `upsertFromTransaction`; `editedByUser=1`)").
 * `updateTransaction` already carries the row-update logic (income-null category, `editedByUser`,
 * `searchText`, `normalizedAccountKey`), so this is a thin draft → patch mapping plus the learn
 * step `accountRuleRepo.upsertFromTransaction` already implements.
 */
export function writeEditedTransaction(draft: AddSheetDraft): { transactionId: string } {
  const transactionId = draft.sourceId;
  if (!transactionId) throw new Error('writeEditedTransaction: draft.sourceId (transaction id) is required');

  const account = draft.account.trim() || null;
  const note = draft.note.trim() || null;
  const categoryId = draft.direction === 'credit' ? null : draft.categoryId; // IMP-011

  updateTransaction(transactionId, {
    amountMinor: draft.amountMinor,
    direction: draft.direction,
    type: draft.type,
    categoryId,
    paymentMethod: draft.paymentMethod,
    account,
    note,
    description: draft.description.trim() || null,
    occurredAt: draft.occurredAt,
  });

  if (account) {
    upsertFromTransaction({
      account,
      categoryId,
      categoryIsUncategorized: categoryId === null,
      note,
      paymentMethod: draft.paymentMethod,
    });
  }

  return { transactionId };
}
