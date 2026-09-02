/**
 * Posting — single vs. group (SPEC-implementation.md §31.4, `SMS_INGEST_TASK` step 7).
 *
 * Note on OS-level stacking: §31.3 specifies a `threadId` so the OS can visually stack these
 * under the group summary, but the installed `expo-notifications@57.0.16` `NotificationContentInput`
 * has no such field, and its Android builder never calls `Notification.Builder#setGroup()` —
 * confirmed against the installed typings and native source. `content.ts` still carries
 * `threadId` on the internal content shape (documents spec intent), but there is nothing to pass
 * it to here: the individual and summary notifications appear as separate entries, not a
 * collapsed stack. Adding real Android grouping would mean native code beyond the "SMS bridge
 * only" module surface (D24), so this is accepted as a platform/library gap, not fixed in JS.
 */

import * as Notifications from 'expo-notifications';

import { countPending } from '@/db/repositories/suggestions';
import type { AccountRule, Suggestion } from '@/db/schema';

import { buildTxnNotification } from './content';

export const TXN_GROUP_IDENTIFIER = 'txn-group';

async function notificationsGranted(): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync();
  return permission.status === 'granted';
}

/** §31.4 steps 1–3 — recompute and show/hide the "N transactions to review" summary. */
export async function refreshGroupSummary(): Promise<void> {
  if (!(await notificationsGranted())) return; // §31.7 — silent

  const pendingCount = countPending();
  if (pendingCount < 2) {
    await Notifications.dismissNotificationAsync(TXN_GROUP_IDENTIFIER).catch(() => {});
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: TXN_GROUP_IDENTIFIER,
    content: {
      title: `${pendingCount} transactions to review`,
      body: '',
      data: { kind: 'group' },
    },
    trigger: null,
  });
}

/**
 * `SMS_INGEST_TASK` step 7 — always posts the individual notification for the new Suggestion,
 * then lets `refreshGroupSummary` decide whether the group summary should also show.
 */
export async function postForSuggestion(
  suggestion: Suggestion,
  rule: AccountRule | null,
): Promise<void> {
  if (!(await notificationsGranted())) return; // §31.7 — silent, no throw, no log noise

  const content = buildTxnNotification(suggestion, rule);
  await Notifications.scheduleNotificationAsync({
    identifier: content.identifier,
    content: {
      title: content.title,
      body: content.body,
      categoryIdentifier: content.categoryIdentifier,
      data: content.data,
    },
    trigger: null,
  });

  await refreshGroupSummary();
}

/** §31.5 — after SAVE/DISCARD, cancel that notification and recount the summary. */
export async function cancelForSuggestion(suggestionId: string): Promise<void> {
  await Notifications.dismissNotificationAsync(`sug:${suggestionId}`).catch(() => {});
  await refreshGroupSummary();
}

/**
 * Review Queue "Dismiss all" (§6.3 / §30.5). V1 has exactly one notification category, so
 * clearing every presented notification is safe and simpler than tracking individual ids.
 */
export async function cancelAllSuggestionNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}
