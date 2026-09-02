/**
 * Notification → route resolution — SPEC-implementation.md §28.3 / §31.6. Pure decision logic,
 * separated from the side-effecting navigation in `notification-router.tsx` so it's unit testable
 * without mounting the app. Always re-reads the Suggestion/Transaction by id — never trusts the
 * notification's own `data` for anything beyond the id, since the row may have changed (been
 * confirmed, dismissed, or deleted) since the notification was posted.
 */

import { getSuggestion } from '@/db/repositories/suggestions';
import { getTransaction } from '@/db/repositories/transactions';

export type NotificationTarget =
  | { kind: 'confirm'; suggestionId: string }
  | { kind: 'transaction'; transactionId: string }
  | { kind: 'review' }
  | { kind: 'home' };

export type NotificationData = { kind?: string; suggestionId?: string } | null | undefined;

/** §31.6 stale-tap table. */
export function resolveNotificationTarget(data: NotificationData): NotificationTarget {
  if (!data) return { kind: 'home' };
  if (data.kind === 'group') return { kind: 'review' };
  if (data.kind !== 'suggestion' || !data.suggestionId) return { kind: 'home' };

  const suggestion = getSuggestion(data.suggestionId);
  if (!suggestion) return { kind: 'home' }; // row gone / dismissed (hard-deleted, D26)

  if (suggestion.status === 'pending') return { kind: 'confirm', suggestionId: suggestion.id };

  if (suggestion.confirmedTransactionId) {
    const txn = getTransaction(suggestion.confirmedTransactionId);
    if (txn && !txn.deletedAt) return { kind: 'transaction', transactionId: txn.id };
  }
  return { kind: 'home' }; // underlying transaction soft-deleted, or otherwise inconsistent
}
