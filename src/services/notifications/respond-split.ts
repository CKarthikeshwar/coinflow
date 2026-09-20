/**
 * FILE PURPOSE
 * ------------
 * What the **Accept** / **Reject** buttons on a split-request notification do (SPEC-UI-UX.md §6.21). Like
 * `respond.ts` for transaction suggestions they run headless — `opensAppToForeground: false`, app killed or
 * not — and re-read the row first, so a stale button press (already decided, withdrawn, purged) is a no-op.
 *
 * - **Accept** → the request becomes something you owe (*You owe*); nothing is paid.
 * - **Reject** → discarded **silently** — the sender is never told (D46) — but kept as a hidden tombstone so
 *   a repeat of the same request doesn't notify again.
 */

import { acceptRequest, rejectRequest } from '@/db/repositories/split-requests';

import { cancelForRequest } from './split-post';

export type SplitDecision = { outcome: 'accepted' | 'rejected' } | { outcome: 'noop' };

export async function handleAcceptRequest(requestId: string): Promise<SplitDecision> {
  const changed = acceptRequest(requestId);
  await cancelForRequest(requestId);
  return changed ? { outcome: 'accepted' } : { outcome: 'noop' };
}

export async function handleRejectRequest(requestId: string): Promise<SplitDecision> {
  const changed = rejectRequest(requestId);
  await cancelForRequest(requestId);
  return changed ? { outcome: 'rejected' } : { outcome: 'noop' };
}
