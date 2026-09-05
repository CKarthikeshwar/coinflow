/**
 * FILE PURPOSE
 * ------------
 * Registers everything the app needs to be able to run CODE IN THE BACKGROUND, i.e. while the
 * app isn't open on screen — most importantly, the handler that runs when a new SMS arrives so
 * the app can detect a transaction from it even if the user never opens CoinFlow.
 *
 * WHERE IT FITS
 * -------------
 * This file must run and finish its top-level registration calls BEFORE anything else in the
 * app, which is why `index.js` (the actual app entry point, see `package.json`'s `"main"`)
 * imports this file first, ahead of `expo-router/entry`. That ordering matters because Android
 * can start this app's JS engine *specifically to run a background task* — e.g. when an SMS
 * arrives while the app is fully closed — without ever mounting the UI/router at all. If the
 * task registrations below lived inside a React component instead, they'd never run in that
 * "background-only" scenario, and background SMS detection would silently stop working whenever
 * the app wasn't already open.
 *
 * TWO SEPARATE BACKGROUND MECHANISMS
 * -----------------------------------
 * Android (and this app) actually uses two different background-task systems, because they
 * solve two different problems:
 *   - SMS ingest → a React Native "headless task." The native Kotlin side
 *     (`CoinflowSmsHeadlessTaskService` in `modules/coinflow-sms/android/`) wakes up the JS
 *     engine and asks it to run a JS function named `'CoinflowSmsIngest'`. This file's job is
 *     just to tell React Native "when something asks for the task named 'CoinflowSmsIngest',
 *     run `smsIngestTask` (defined in `./sms-ingest.ts`)" via `AppRegistry.registerHeadlessTask`.
 *   - Notification response → a separate `expo-task-manager` background task
 *     (`NOTIFICATION_RESPONSE_TASK`) that fires when the user taps "Save" or "Discard" directly
 *     on a notification without opening the app. `handleSave`/`handleDiscard`
 *     (`src/services/notifications/respond.ts`) do the actual work.
 *
 * DATA FLOW — the SMS background path
 * -------------------------------------
 *   Android receives an SMS
 *     ↓ (native Kotlin, modules/coinflow-sms/android/)
 *   CoinflowSmsHeadlessTaskService wakes the JS engine, asks for task 'CoinflowSmsIngest'
 *     ↓
 *   AppRegistry runs smsIngestTask (src/services/tasks/sms-ingest.ts)
 *     ↓
 *   parseSms() (src/domain/parser/) → suggestionRepo.insertIfNew() → a notification is posted
 *
 * IMPORTANT
 * ---------
 * All the registration calls below are safe to run on every single app launch — they're
 * idempotent (re-registering the same task name/category twice doesn't cause duplicates), which
 * is what lets this file just unconditionally run its setup at import time rather than needing
 * "have I already registered this" guard logic.
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
