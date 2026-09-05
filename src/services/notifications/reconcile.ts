/**
 * FILE PURPOSE
 * ------------
 * Self-heals missing notifications: finds every still-pending suggestion that SHOULD have a
 * notification showing but doesn't (e.g. Android dropped it on a device reboot, or a previous
 * run of the background task was killed after saving the suggestion but before posting for it),
 * and re-posts for each one.
 *
 * WHERE IT FITS
 * -------------
 * Currently called from exactly one place: the very end of `smsIngestTask`
 * (`src/services/tasks/sms-ingest.ts`, step 8) — every time a new SMS is processed, this also
 * takes the opportunity to check for and repair any other suggestion missing its notification.
 * The function is intentionally idempotent (safe to call repeatedly, does nothing extra if
 * everything is already in sync), so calling it more often is always safe.
 *
 * IMPORTANT — worth investigating
 * -----------------------------------
 * This app deliberately ships no `BOOT_COMPLETED` Android receiver (a bigger native surface
 * than the SMS-only bridge is scoped for), so Android silently drops any notification that was
 * showing when the device reboots. The original design intent for recovering from that was for
 * this function to also run on every app launch and on `AppState` becoming `active` (opening
 * the app / bringing it to the foreground) — not just as a side effect of a new SMS arriving.
 * As it stands, if a suggestion's notification is lost to a reboot and the user doesn't receive
 * another SMS afterward, nothing currently re-triggers this reconciliation — the suggestion
 * would still show correctly in the Review Queue, just without its notification restored. This
 * looks like a gap between the original design and what actually got wired up; flagged here for
 * you to look at rather than fixed as part of a documentation pass.
 */

import * as Notifications from 'expo-notifications';

import { getAccountRule } from '@/db/repositories/account-rules';
import { listPending } from '@/db/repositories/suggestions';

import { buildTxnNotification } from './content';
import { refreshGroupSummary } from './post';

export async function reconcileNotifications(): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return; // §31.7 — silent

  const pending = listPending();
  const presented = await Notifications.getPresentedNotificationsAsync();
  const presentedIds = new Set(presented.map((n) => n.request.identifier));

  for (const suggestion of pending) {
    if (presentedIds.has(`sug:${suggestion.id}`)) continue;

    const rule = suggestion.normalizedKey ? getAccountRule(suggestion.normalizedKey) : null;
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
  }

  await refreshGroupSummary();
}
