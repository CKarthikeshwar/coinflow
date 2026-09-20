/**
 * FILE PURPOSE
 * ------------
 * Decides which screen to open when the user taps a notification (not a button on it — the
 * notification body itself). Deliberately kept as pure decision logic with no navigation code
 * in it, so `src/features/app-shell/notification-router.tsx` (which does the actual navigating)
 * can stay a thin wrapper, and this decision logic can be unit-tested without mounting any UI.
 *
 * WHERE IT FITS
 * -------------
 * The only caller is `notification-router.tsx`, mounted once in `src/app/_layout.tsx`, which
 * listens for a notification tap and calls `resolveNotificationTarget` to find out where to go.
 *
 * IMPORTANT — "stale tap" handling
 * ------------------------------------
 * Time can pass between a notification being posted and the user actually tapping it — long
 * enough that the underlying suggestion/transaction may have already changed (confirmed via a
 * different route, dismissed, deleted). This function NEVER trusts the notification's own
 * stored data beyond the id — it always re-reads the current row from the database and decides
 * the destination from its *current* state, so a stale tap can never route somewhere that no
 * longer makes sense (e.g. trying to "confirm" a suggestion that was already confirmed).
 */

import { getRequest } from '@/db/repositories/split-requests';
import { getSuggestion } from '@/db/repositories/suggestions';
import { getTransaction } from '@/db/repositories/transactions';

export type NotificationTarget =
  | { kind: 'confirm'; suggestionId: string }
  | { kind: 'transaction'; transactionId: string }
  | { kind: 'review' }
  /** V2 (§43.4) — the Splits page, on the segment that still makes sense for what was tapped. */
  | { kind: 'splits'; tab: 'owed' | 'owe' | 'requests' }
  | { kind: 'home' };

export type NotificationData = { kind?: string; suggestionId?: string; requestId?: string } | null | undefined;

/** §31.6 stale-tap table. */
export function resolveNotificationTarget(data: NotificationData): NotificationTarget {
  if (!data) return { kind: 'home' };
  if (data.kind === 'group') return { kind: 'review' };

  // V2 (§43.4) — the summary always lands on the Requests list.
  if (data.kind === 'split-group') return { kind: 'splits', tab: 'requests' };
  if (data.kind === 'split-request') {
    if (!data.requestId) return { kind: 'splits', tab: 'requests' };
    const request = getRequest(data.requestId);
    if (!request) return { kind: 'home' }; // purged — nothing to show
    // Re-read the row (never trust the payload): an undecided request goes to Requests; one already decided
    // goes where it now lives — never to a dead sheet.
    if (request.status === 'unattended') return { kind: 'splits', tab: 'requests' };
    if (request.status === 'accepted') return { kind: 'splits', tab: 'owe' };
    return { kind: 'splits', tab: 'owed' }; // rejected / withdrawn: just the Splits page
  }

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
