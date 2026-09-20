/**
 * FILE PURPOSE
 * ------------
 * Shows / removes the **split-request notifications** and keeps their "N split requests" summary right
 * (SPEC-implementation.md §43.4). Same shape as `post.ts` for transaction suggestions, and the same rules:
 *
 * - notification permission off ⇒ silent (P-7 / §31.7): the request is already stored as *Unattended*, so
 *   nothing is lost — it just isn't announced;
 * - swiping a notification away never loses a request (it was stored when it arrived);
 * - nothing here accepts, rejects or replies on its own — that only ever happens from a tap (D46).
 */

import * as Notifications from 'expo-notifications';

import { getPerson } from '@/db/repositories/persons';
import { listRequestsByStatus } from '@/db/repositories/split-requests';
import type { SplitRequestIn } from '@/db/schema';

import { SPLIT_REQUESTS_CHANNEL_ID } from './channel';
import { buildSplitNotification, requestNotificationId } from './split-content';

/** Android posts a `trigger: null` notification to a fallback channel — name ours so the quieter channel is used. */
const SPLIT_TRIGGER = { channelId: SPLIT_REQUESTS_CHANNEL_ID } as const;

export const SPLIT_GROUP_IDENTIFIER = 'split-group';

async function notificationsGranted(): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync();
  return permission.status === 'granted';
}

/** With 2+ unattended requests, one summary `N split requests`; with fewer, none. */
export async function refreshSplitGroupSummary(): Promise<void> {
  if (!(await notificationsGranted())) return;
  const count = listRequestsByStatus(['unattended']).length;
  if (count < 2) {
    await Notifications.dismissNotificationAsync(SPLIT_GROUP_IDENTIFIER).catch(() => {});
    return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: SPLIT_GROUP_IDENTIFIER,
    content: { title: `${count} split requests`, body: '', data: { kind: 'split-group' } },
    trigger: SPLIT_TRIGGER,
  });
}

/** True when the request's sender is a person the user saved (not one auto-created from the SMS itself). */
function isKnownPerson(request: Pick<SplitRequestIn, 'fromPersonId'>): boolean {
  if (!request.fromPersonId) return false;
  const person = getPerson(request.fromPersonId);
  return !!person && person.source !== 'sms';
}

/**
 * Posts (or refreshes, when the sender changed the amount) the notification for one request. An *accepted* request
 * whose amount the sender changed is announced too — that must never happen quietly — but without Accept / Reject.
 */
export async function postForRequest(request: SplitRequestIn): Promise<void> {
  if (!(await notificationsGranted())) return;
  const content = buildSplitNotification(request, {
    knownPerson: isKnownPerson(request),
    changedAfterAccept: request.status === 'accepted',
  });
  await Notifications.scheduleNotificationAsync({
    identifier: content.identifier,
    content: {
      title: content.title,
      body: content.body,
      categoryIdentifier: content.categoryIdentifier,
      data: content.data,
    },
    trigger: SPLIT_TRIGGER,
  });
  await refreshSplitGroupSummary();
}

/** After Accept / Reject / withdrawal: remove that notification and recount the summary. */
export async function cancelForRequest(requestId: string): Promise<void> {
  await Notifications.dismissNotificationAsync(requestNotificationId(requestId)).catch(() => {});
  await refreshSplitGroupSummary();
}
