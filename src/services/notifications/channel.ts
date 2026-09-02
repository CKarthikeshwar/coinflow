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
    sound: 'default',
    vibrationPattern: [0, 150],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    bypassDnd: false,
    showBadge: true,
  });
}
