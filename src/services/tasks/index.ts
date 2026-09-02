/**
 * Background task + notification-category registration (SPEC-implementation.md §17.2 / §31.1/2).
 *
 * Imported at the very top of the app entry (`index.js`), before `expo-router` mounts, so the
 * definitions exist whether the JS context was started by the UI or by a background trigger.
 *
 * Two paths, two mechanisms (see CR-3, §37):
 *   - SMS ingest  → RN headless task. `CoinflowSmsHeadlessTaskService` (native, §17.6) starts
 *                   the JS task named `CoinflowSmsIngest`; we register its handler with
 *                   `AppRegistry.registerHeadlessTask`. There is no SMS `TaskConsumer` in
 *                   `expo-task-manager`, and §17.6 already mandates `HeadlessJsTaskService`.
 *   - Notification response → `expo-notifications` background handler via
 *                   `TaskManager.defineTask` + `Notifications.registerTaskAsync` (§17.2 / §31).
 */

import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppRegistry, Platform } from 'react-native';

import { ensureNotificationChannel } from '@/services/notifications/channel';
import { registerNotificationCategories } from '@/services/notifications/categories';
import { handleDiscard, handleSave } from '@/services/notifications/respond';

import { smsIngestTask } from './sms-ingest';

/** Native task name — must match `CoinflowSmsHeadlessTaskService.getTaskConfig` (§17.6). */
export const SMS_INGEST_TASK = 'CoinflowSmsIngest';
/** `expo-notifications` background-response task id (§17.4b / §31). */
export const NOTIFICATION_RESPONSE_TASK = 'coinflow.NOTIFICATION_RESPONSE';

// --- SMS ingest (app-killed wake path) ---------------------------------------
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(SMS_INGEST_TASK, () => smsIngestTask);
}

// --- Notification channel + categories (idempotent — safe to call on every launch) ----------
ensureNotificationChannel().catch((e: unknown) => {
  console.warn('[tasks] ensureNotificationChannel failed:', (e as Error)?.name ?? 'unknown');
});
registerNotificationCategories().catch((e: unknown) => {
  console.warn('[tasks] registerNotificationCategories failed:', (e as Error)?.name ?? 'unknown');
});

// --- Notification action responses (app-killed) -----------------------------
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  NOTIFICATION_RESPONSE_TASK,
  async ({ data, error }) => {
    if (error) {
      console.warn('[NOTIFICATION_RESPONSE_TASK] error:', error.message);
      return;
    }
    // A `NotificationResponse` (our local notifications) vs. the remote-push payload shape —
    // narrow to ours; anything else is not a shape we posted.
    if (!data || !('actionIdentifier' in data)) return;

    const payload = data.notification.request.content.data as
      | { kind?: string; suggestionId?: string }
      | undefined;
    if (payload?.kind !== 'suggestion' || !payload.suggestionId) return;

    // `ADD` and a body tap carry `opensAppToForeground:true` — those are handled by
    // `NotificationRouter` (`src/features/app-shell/notification-router.tsx`, mounted in
    // `_layout.tsx`, §28.3), not here.
    if (data.actionIdentifier === 'SAVE') {
      await handleSave(payload.suggestionId);
    } else if (data.actionIdentifier === 'DISCARD') {
      await handleDiscard(payload.suggestionId);
    }
  },
);

if (Platform.OS !== 'web') {
  Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK).catch((e: unknown) => {
    // Best-effort: the durable Review Queue (F11) is the fallback if this never registers.
    console.warn('[tasks] registerTaskAsync failed:', (e as Error)?.name ?? 'unknown');
  });
}
