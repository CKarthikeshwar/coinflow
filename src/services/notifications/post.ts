/**
 * FILE PURPOSE
 * ------------
 * Actually calls `expo-notifications` to post a notification onto the device — the one place in
 * the app that does this. Handles both posting one transaction-review notification and keeping
 * a "N transactions to review" summary notification in sync as suggestions come and go.
 *
 * WHERE IT FITS
 * -------------
 * `postForSuggestion` is called from `src/services/tasks/sms-ingest.ts` (step 7 of the SMS
 * pipeline) every time a new suggestion is created. `cancelForSuggestion` is called from
 * `src/services/notifications/respond.ts` after the user saves or discards one, and
 * `cancelAllSuggestionNotifications` from the Review Queue's "Dismiss all."
 *
 * IMPORTANT — a known platform limitation, left as-is on purpose
 * -----------------------------------------------------------------
 * The design intent was for individual transaction notifications to visually stack/collapse
 * under the "N transactions to review" summary notification (standard Android notification
 * grouping). That doesn't actually happen: the installed version of `expo-notifications`
 * doesn't expose the Android API needed to group notifications that way, so each one shows as
 * its own separate entry instead of a collapsed group. Fixing this for real would require
 * writing native Android code, which is outside what this app's one custom native module is
 * scoped to do (see `modules/coinflow-sms/`, which is deliberately kept to "the SMS bridge
 * only"). This is a known, accepted gap, not a bug to chase.
 *
 * The exact technical reason: `content.ts` still builds a `threadId` field (documenting the
 * original intent), but the installed `expo-notifications` version's `NotificationContentInput`
 * type has no field to receive it, and its Android implementation never calls the native
 * `Notification.Builder#setGroup()` method that would be needed to actually group notifications
 * — so there's genuinely nothing this file could pass through even if it wanted to. The
 * individual and summary notifications simply appear as separate entries.
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
