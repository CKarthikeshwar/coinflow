/**
 * FILE PURPOSE
 * ------------
 * What a **split-request notification** says (SPEC-UI-UX.md §6.21, SPEC-implementation.md §43.4):
 * title `Rahul requested ₹450`, body `for Momos · CoinFlow split`, with **Accept** / **Reject** actions.
 * Pure — builds the content; `split-post.ts` shows it.
 *
 * The note is untrusted text from another phone (D46): it goes into the body as plain text, already
 * sanitised to ≤ 24 GSM-7 characters by the receive path. A request from a number that is not among the
 * user's saved people says so (`· not in your people`), so a stranger's request never looks familiar.
 */

import type { SplitRequestIn } from '@/db/schema';
import { formatRupees } from '@/domain/format/money';

import { SPLIT_REQUEST_CATEGORY } from './categories';

/** Groups every request notification under one thread. */
export const SPLIT_THREAD_ID = 'split-requests-group';

export type SplitNotificationData = {
  kind: 'split-request';
  requestId: string;
  postedAt: number;
};

export type SplitNotificationContent = {
  identifier: string;
  categoryIdentifier: string;
  title: string;
  body: string;
  threadId: string;
  data: SplitNotificationData;
};

/** `req:<id>` — the notification identifier, so it can be found / dismissed later. */
export const requestNotificationId = (requestId: string): string => `req:${requestId}`;

export function buildSplitNotification(
  request: Pick<SplitRequestIn, 'id' | 'fromLabel' | 'amountMinor' | 'forNote'>,
  options: { knownPerson: boolean; /** The sender changed a request you had already accepted. */ changedAfterAccept?: boolean },
): SplitNotificationContent {
  const note = request.forNote?.trim();
  const parts = [note ? `for ${note}` : '', 'CoinFlow split'].filter(Boolean);
  const body = parts.join(' · ') + (options.knownPerson ? '' : ' · not in your people');
  // A request you already accepted can still be changed by the sender (§42.2) — that must never happen quietly,
  // but Accept / Reject no longer apply to it, so this posting carries no actions.
  const changed = options.changedAfterAccept === true;
  return {
    identifier: requestNotificationId(request.id),
    categoryIdentifier: changed ? '' : SPLIT_REQUEST_CATEGORY,
    title: changed
      ? `${request.fromLabel} changed the request to ${formatRupees(request.amountMinor)}`
      : `${request.fromLabel} requested ${formatRupees(request.amountMinor)}`,
    body,
    threadId: SPLIT_THREAD_ID,
    data: { kind: 'split-request', requestId: request.id, postedAt: Date.now() },
  };
}
