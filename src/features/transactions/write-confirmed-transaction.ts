/**
 * The shared "write a transaction from a draft" path — SPEC-implementation.md §17.4(b) /
 * §25.2 / §30.6: `insertTransaction` + (if confirming a Suggestion) `confirmSuggestion` +
 * `upsertFromTransaction`, all in **one** DB transaction. Built for F3's Confirmation sheet;
 * `draft.mode` already distinguishes `'confirm'` from `'add'`/`'edit'`, so this is the same
 * function F4 (manual Add) will call later — not built ahead of need, just shaped to not
 * require a rewrite when F4 lands.
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/client';
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
