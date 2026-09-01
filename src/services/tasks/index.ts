/**
 * Background task + (later) notification-category registration (SPEC-implementation.md §17.2).
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

import { smsIngestTask } from './sms-ingest';

/** Native task name — must match `CoinflowSmsHeadlessTaskService.getTaskConfig` (§17.6). */
export const SMS_INGEST_TASK = 'CoinflowSmsIngest';
/** `expo-notifications` background-response task id (§17.4b / §31). */
export const NOTIFICATION_RESPONSE_TASK = 'coinflow.NOTIFICATION_RESPONSE';

// --- SMS ingest (app-killed wake path) ---------------------------------------
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(SMS_INGEST_TASK, () => smsIngestTask);
}

// --- Notification action responses (app-killed) -----------------------------
// STEP 4 SCOPE: the task is defined + registered so responses aren't dropped, but the
// Save / Add / Discard handling (§17.4b / §31.5) is a step-5 no-op for now.
TaskManager.defineTask(NOTIFICATION_RESPONSE_TASK, async ({ error }) => {
  if (error) {
    console.warn('[NOTIFICATION_RESPONSE_TASK] error:', error.message);
    return;
  }
  // TODO(step 5 / §17.4b): load Suggestion by id → re-match AccountRule → one DB txn
  // (insert Transaction, confirm Suggestion, bump rule) → cancel / refresh notifications.
});

if (Platform.OS !== 'web') {
  Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK).catch((e: unknown) => {
    // Best-effort: the durable Review Queue (F11) is the fallback if this never registers.
    console.warn('[tasks] registerTaskAsync failed:', (e as Error)?.name ?? 'unknown');
  });
}
