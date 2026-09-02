/**
 * Reboot / process-death restore — SPEC-implementation.md §31.8. Android drops posted
 * notifications on reboot, and CoinFlow deliberately ships no `BOOT_COMPLETED` receiver (D24).
 * Recovery is lazy and JS-side: run on every app launch, on `AppState → active`, and at the end
 * of `SMS_INGEST_TASK` (its step 8 self-heal — same operation, reused rather than duplicated).
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
