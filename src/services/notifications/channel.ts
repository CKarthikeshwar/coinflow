/**
 * The one Android notification channel — SPEC-implementation.md §31.1. Created at first app
 * launch and re-asserted on every launch (idempotent — `setNotificationChannelAsync` upserts).
 * Also called from `SMS_INGEST_TASK` step 7: a headless post must not assume the UI ever ran.
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
