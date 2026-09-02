/**
 * `SAVE` / `DISCARD` bodies — SPEC-implementation.md §31.5, shared verbatim with §17.4(b). Runs
 * headless (app killed or backgrounded) via `NOTIFICATION_RESPONSE_TASK`, and from the UI once
 * the Review Queue / Confirmation sheet exist (F11/F3).
 */

import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { db } from '@/db/client';
import { getAccountRule } from '@/db/repositories/account-rules';
import { dismissSuggestion, getSuggestion } from '@/db/repositories/suggestions';
import { accountRules, suggestions, transactions } from '@/db/schema';
import { isKnownAccountRule } from '@/domain/categorize';

import { cancelForSuggestion } from './post';

export type SaveOutcome =
  | { outcome: 'saved'; transactionId: string }
  | { outcome: 'noop'; reason: 'gone' | 'already-confirmed' | 'no-rule' | 'incomplete' };

/**
 * Re-loads the `Suggestion` and re-matches the `AccountRule` by `normalizedKey` (it may have
 * changed since the notification was posted) before writing anything — never writes blind.
 */
export async function handleSave(suggestionId: string): Promise<SaveOutcome> {
  const suggestion = getSuggestion(suggestionId);
  if (!suggestion) return { outcome: 'noop', reason: 'gone' };
  if (suggestion.status === 'confirmed') return { outcome: 'noop', reason: 'already-confirmed' };

  const rule = suggestion.normalizedKey ? getAccountRule(suggestion.normalizedKey) : null;
  // `Save` only ever appears on a known-account notification — a rule with a category OR a
  // note (§25.1, `isKnownAccountRule`; category-only was too strict, a note-only rule is still
  // "known" and a Save should be allowed to land an Uncategorized transaction with that note).
  // If the rule vanished since the notification was posted, don't write blind (§31.5) — in
  // practice unreachable (the button doesn't exist without one); the guard stays for the race.
  if (!rule || !isKnownAccountRule(rule)) return { outcome: 'noop', reason: 'no-rule' };
  if (suggestion.amountMinor === null || suggestion.direction === null || suggestion.occurredAt === null) {
    return { outcome: 'noop', reason: 'incomplete' };
  }

  const transactionId = randomUUID();
  const now = Date.now();
  const account = suggestion.account;
  const note = rule.lastNote?.trim() || null;
  const direction = suggestion.direction;
  const amountMinor = suggestion.amountMinor;
  const occurredAt = suggestion.occurredAt;

  db.transaction((tx) => {
    tx.insert(transactions)
      .values({
        id: transactionId,
        amountMinor,
        direction,
        type: direction === 'credit' ? 'income' : 'expense',
        categoryId: direction === 'credit' ? null : rule.categoryId, // IMP-011
        paymentMethod: rule.lastPaymentMethod ?? suggestion.paymentMethod,
        account,
        normalizedAccountKey: suggestion.normalizedKey,
        note,
        description: null,
        searchText: `${note ?? ''} ${account ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim(),
        occurredAt,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        source: 'sms',
        smsSender: suggestion.smsSender,
        smsReceivedAt: suggestion.smsReceivedAt,
        dedupeKey: suggestion.dedupeKey,
        editedByUser: false,
      })
      .run();

    tx.update(suggestions)
      .set({ status: 'confirmed', confirmedTransactionId: transactionId })
      .where(eq(suggestions.id, suggestionId))
      .run();

    tx.update(accountRules)
      .set({ hitCount: rule.hitCount + 1, updatedAt: now })
      .where(eq(accountRules.normalizedKey, rule.normalizedKey))
      .run();
  });

  await cancelForSuggestion(suggestionId);
  return { outcome: 'saved', transactionId };
}

export type DiscardOutcome = { outcome: 'discarded' } | { outcome: 'noop' };

/** Hard delete (D26) — no ledger write (IMP-007). */
export async function handleDiscard(suggestionId: string): Promise<DiscardOutcome> {
  const suggestion = getSuggestion(suggestionId);
  if (!suggestion || suggestion.status !== 'pending') {
    await cancelForSuggestion(suggestionId);
    return { outcome: 'noop' };
  }
  dismissSuggestion(suggestionId);
  await cancelForSuggestion(suggestionId);
  return { outcome: 'discarded' };
}
