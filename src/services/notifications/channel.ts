/**
 * FILE PURPOSE
 * ------------
 * Creates the one Android "notification channel" this app posts to (Android groups
 * notifications into channels so the user can control their behavior — sound, importance — per
 * channel in system settings, rather than per individual notification).
 *
 * WHERE IT FITS
 * -------------
 * Called from `src/services/tasks/index.ts` on every app launch, and effectively required
 * before `src/services/notifications/post.ts` can post anything — Android silently drops a
 * notification aimed at a channel that doesn't exist yet. It's safe to call repeatedly:
 * `setNotificationChannelAsync` creates-or-updates, so calling it again just re-confirms the
 * same settings rather than erroring or duplicating anything.
 *
 * IMPORTANT
 * ---------
 * This has to work even when the UI has never run — a background SMS can arrive and need to
 * post a notification before the user has ever opened the app once — so `sms-ingest.ts` also
 * calls this itself rather than assuming `src/services/tasks/index.ts`'s call already ran.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const TXN_REVIEW_CHANNEL_ID = 'txn-review';

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(TXN_REVIEW_CHANNEL_ID, {
    name: 'Transaction review',
    importance: Notifications.AndroidImportance.HIGH,
    // No `sound` field at all — omitting it (not `'default'`) is what actually makes
    // expo-notifications fall back to the system default sound. Passing the literal string
    // `'default'` makes it look for a *custom sound file* named "default" and warn when it's
    // not found (confirmed against the installed `expo-notifications` Android source).
    vibrationPattern: [0, 150],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    bypassDnd: false,
    showBadge: true,
  });
}
