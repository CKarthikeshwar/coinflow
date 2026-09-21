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

import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppRegistry, Platform } from 'react-native';

import { setSetting } from '@/db/repositories/settings';
import { ensureNotificationChannel } from '@/services/notifications/channel';
import { registerNotificationCategories } from '@/services/notifications/categories';
import { ensureDailyReminder } from '@/services/notifications/daily-reminder';
import { handleDiscard, handleSave } from '@/services/notifications/respond';
import { handleAcceptRequest, handleRejectRequest } from '@/services/notifications/respond-split';
import { armSmsStoreTrigger } from '@/services/sms';
import { publishWidgetSnapshotNow } from '@/services/widgets/publish';

import { reconcileMissedSms } from './sms-reconcile';
import { smsIngestTask, type SmsHeadlessPayload } from './sms-ingest';

/** Native task name — must match `CoinflowSmsHeadlessTaskService.getTaskConfig` (§17.6). */
export const SMS_INGEST_TASK = 'CoinflowSmsIngest';
/** `expo-notifications` background-response task id (§17.4b / §31). */
export const NOTIFICATION_RESPONSE_TASK = 'coinflow.NOTIFICATION_RESPONSE';
/** Periodic `expo-background-task` id — the reconciliation backstop (§17.9, CR-11). */
export const SMS_RECONCILE_TASK = 'coinflow.SMS_RECONCILE';
/** Native task name for the SMS-store watcher — must match `CoinflowSmsHeadlessTaskService` (§17.11, CR-16). */
export const SMS_STORE_CHANGED_TASK = 'CoinflowSmsStoreChanged';
/**
 * Minimum gap between periodic background sweeps (§17.9, CR-15 → CR-16). 12h: since CR-16 the
 * real-time work is done by the broadcast receiver plus the SMS-store watcher, so this job is now
 * mostly a watchdog — it re-arms the store watcher (which Android drops on reboot) with the 48h
 * inbox sweep as a last-resort net. Still only a *minimum*.
 */
export const SMS_RECONCILE_INTERVAL_MINUTES = 12 * 60;
/** How far back the store-watcher sweep re-reads (its job is "what just arrived", not a full net). */
export const STORE_TRIGGER_LOOKBACK_MS = 6 * 60 * 60 * 1000;

// --- SMS ingest (app-killed wake path) ---------------------------------------
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(SMS_INGEST_TASK, () => async (payload: SmsHeadlessPayload) => {
    // §17.10 (CR-12) — proves Android actually invoked the real-time path, independent of
    // whether the message goes on to match a sender; best-effort, must never block ingest.
    try {
      setSetting('smsLastRealtimeInvokedAt', Date.now());
    } catch (e) {
      console.warn('[tasks] smsLastRealtimeInvokedAt write failed:', (e as Error)?.name ?? 'unknown');
    }
    await smsIngestTask(payload);
    publishWidgetSnapshotNow(); // §44.3 — the queue widget updates with the app closed
  });
}

// --- SMS-store watcher (§17.11, CR-16) — a JobScheduler job that fires when Android's SMS store
// changes, so a message another app swallowed the broadcast for is still caught within seconds.
// Android runs it via `CoinflowSmsHeadlessTaskService`; this is the JS half. It must also be
// (re-)armed from JS: the job fires once, and Android drops it on reboot — arm points are here
// (every JS start, including headless ones), app open/foreground (SmsReconciler), and the periodic
// task below. `armSmsStoreTrigger` is a cheap no-op when the job is already pending.
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(SMS_STORE_CHANGED_TASK, () => async () => {
    try {
      setSetting('smsLastStoreTriggerAt', Date.now());
    } catch (e) {
      console.warn('[tasks] smsLastStoreTriggerAt write failed:', (e as Error)?.name ?? 'unknown');
    }
    await reconcileMissedSms({ notify: true, source: 'storeTrigger', lookbackMs: STORE_TRIGGER_LOOKBACK_MS });
    publishWidgetSnapshotNow();
  });
  try {
    armSmsStoreTrigger();
  } catch (e) {
    console.warn('[tasks] armSmsStoreTrigger failed:', (e as Error)?.name ?? 'unknown');
  }
}

// --- Missed-SMS reconciliation backstop (§17.9, CR-11) — opportunistic, OS-batched; the
// real-time broadcast path and the app-open sweep (SmsReconciler) both run first. --------------
if (Platform.OS === 'android') {
  TaskManager.defineTask(SMS_RECONCILE_TASK, async () => {
    armSmsStoreTrigger(); // watchdog: Android drops the store watcher on reboot (§17.11)
    await reconcileMissedSms({ notify: true, source: 'sweepPeriodic' });
    publishWidgetSnapshotNow(); // also rolls the widgets over to a new month
    return BackgroundTask.BackgroundTaskResult.Success;
  });
  // Explicit 12h minimum interval (CR-15 → CR-16). Without it `expo-background-task` falls back to
  // once a day on Android. Still only a minimum — Android batches/defers background work (Doze,
  // App Standby) — and the job no longer requires a network connection
  // (patches/expo-background-task+57.0.16.patch).
  BackgroundTask.registerTaskAsync(SMS_RECONCILE_TASK, {
    minimumInterval: SMS_RECONCILE_INTERVAL_MINUTES,
  }).catch((e: unknown) => {
    console.warn('[tasks] SMS_RECONCILE_TASK registration failed:', (e as Error)?.name ?? 'unknown');
  });
}

// --- Notification channel + categories (idempotent — safe to call on every launch) ----------
ensureNotificationChannel().catch((e: unknown) => {
  console.warn('[tasks] ensureNotificationChannel failed:', (e as Error)?.name ?? 'unknown');
});
registerNotificationCategories().catch((e: unknown) => {
  console.warn('[tasks] registerNotificationCategories failed:', (e as Error)?.name ?? 'unknown');
});
// Channel must exist before the daily trigger references it.
ensureNotificationChannel()
  .then(ensureDailyReminder)
  .catch((e: unknown) => {
    console.warn('[tasks] ensureDailyReminder failed:', (e as Error)?.name ?? 'unknown');
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
      | { kind?: string; suggestionId?: string; requestId?: string }
      | undefined;

    // V2 (§6.21) — Accept / Reject on a split-request notification, headless like Save / Discard.
    if (payload?.kind === 'split-request' && payload.requestId) {
      if (data.actionIdentifier === 'ACCEPT') await handleAcceptRequest(payload.requestId);
      else if (data.actionIdentifier === 'REJECT') await handleRejectRequest(payload.requestId);
      publishWidgetSnapshotNow();
      return;
    }

    if (payload?.kind !== 'suggestion' || !payload.suggestionId) return;

    // `ADD` and a body tap carry `opensAppToForeground:true` — those are handled by
    // `NotificationRouter` (`src/features/app-shell/notification-router.tsx`, mounted in
    // `_layout.tsx`, §28.3), not here.
    if (data.actionIdentifier === 'SAVE') {
      await handleSave(payload.suggestionId);
    } else if (data.actionIdentifier === 'DISCARD') {
      await handleDiscard(payload.suggestionId);
    }
    publishWidgetSnapshotNow(); // Save / Discard change the queue widget
  },
);

if (Platform.OS !== 'web') {
  Notifications.registerTaskAsync(NOTIFICATION_RESPONSE_TASK).catch((e: unknown) => {
    // Best-effort: the durable Review Queue (F11) is the fallback if this never registers.
    console.warn('[tasks] registerTaskAsync failed:', (e as Error)?.name ?? 'unknown');
  });
}
