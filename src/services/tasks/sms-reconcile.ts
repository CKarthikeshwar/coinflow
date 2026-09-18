/**
 * FILE PURPOSE
 * ------------
 * A second, independent way to detect a transaction SMS — one that does not depend on
 * `SmsReceiver`'s `SMS_RECEIVED` broadcast ever having fired at all (SPEC-implementation.md §17.8,
 * CR-10). Found on-device: another app holding `RECEIVE_SMS` (e.g. Truecaller) can register its
 * own receiver at the same top priority as the real default SMS app and call `abortBroadcast()`
 * on a message it recognizes as a bank SMS, before CoinFlow's receiver (lower priority) ever runs
 * — no crash, no log, nothing, because nothing native or JS executed at all.
 *
 * WHERE IT FITS
 * -------------
 * Aborting that broadcast does not stop the message from being written to Android's own shared
 * SMS store — confirmed on-device. So this function re-reads the last `LOOKBACK_MS` of that store
 * directly (via the native `getRecentInboxMessagesAsync`, `src/services/sms.ts`) and feeds every
 * message through the exact same `smsIngestTask` (`./sms-ingest.ts`) used by the real broadcast
 * path — not a parallel pipeline. The existing `dedupeKey` guard (§17.3 step 4) already makes
 * re-processing an already-ingested message free of duplicate Suggestions, so a fixed lookback
 * window (rather than a persisted "last synced" cursor) is deliberately simple: no cursor-drift or
 * clock-skew bugs to worry about, at the cost of re-scanning a bounded, small window every time.
 *
 * Called from two places (§17.9, CR-11), each deciding `notify` for its own reason:
 *  - `SmsReconciler` (`src/features/app-shell/sms-reconciler.tsx`) on app launch and every
 *    `AppState → active` transition → `{ notify: false }` — the user is already looking at the
 *    app, so a caught message lands quietly in the Review Queue instead of pushing a notification.
 *  - `SMS_RECONCILE_TASK`, a periodic `expo-background-task` (`src/services/tasks/index.ts`) →
 *    `{ notify: true }` — this one can fire while the user isn't looking at anything, so it
 *    behaves like a normal incoming SMS. Explicitly *not* a replacement for the real-time
 *    broadcast path (D18/D23 stand) — an opportunistic, OS-batched backstop behind it and the
 *    app-open sweep.
 *
 * IMPORTANT
 * ---------
 * Must never throw — same "log the error's type name only, never its message, and swallow it"
 * convention as `smsIngestTask` itself (§17.2/§32); a failed sweep is silently skipped, same trade
 * as `reconcileNotifications`'s own permission-denied early return (§31.7).
 */

import { ensureMigrated } from '@/db/maintenance';
import { setSetting } from '@/db/repositories/settings';
import { getRecentSmsMessages, isSmsCaptureSupported } from '@/services/sms';

import type { SmsCatchSource } from './catch-stats';
import { smsIngestTask } from './sms-ingest';

const LOOKBACK_MS = 48 * 60 * 60 * 1000;

export type ReconcileOptions = {
  notify: boolean;
  /** Which trigger this is, for the "which path caught it" counters (CR-16). */
  source?: Exclude<SmsCatchSource, 'broadcast'>;
  /** How far back to re-read the SMS store; defaults to 48h. The store-watcher uses less. */
  lookbackMs?: number;
};

export async function reconcileMissedSms(options: ReconcileOptions): Promise<void> {
  try {
    if (!isSmsCaptureSupported()) return;
    // A background trigger can run before the UI ever migrated the database (§17.5 / §20.4).
    await ensureMigrated();

    const messages = await getRecentSmsMessages(Date.now() - (options.lookbackMs ?? LOOKBACK_MS));
    // §17.10 (CR-12) — proves the sweep ran and how much it found, regardless of which of the
    // two triggers (§17.9) fired it; only stamped once the fetch above has actually succeeded.
    setSetting('smsLastReconcileSweepAt', Date.now());
    setSetting('smsLastReconcileMatchCount', messages.length);

    for (const { sender, body, timestampMs } of messages) {
      await smsIngestTask(
        { sender, body, timestampMs },
        { notify: options.notify, source: options.source ?? (options.notify ? 'sweepPeriodic' : 'sweepOpen') },
      );
    }
  } catch (e) {
    // No PII in the log — type name only (§17.2 / P-9).
    console.warn('[reconcileMissedSms] dropped:', (e as Error)?.name ?? 'unknown');
  }
}
