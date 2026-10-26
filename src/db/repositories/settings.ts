/**
 * FILE PURPOSE
 * ------------
 * A tiny generic key-value store on top of the `appSettings` table, for small app-wide flags
 * that don't need their own dedicated table — "has onboarding finished," "did the user dismiss
 * this banner," "is crash reporting turned on," and so on. Every value is JSON-encoded before
 * storage, so a setting can hold a boolean, number, string, or small object.
 *
 * WHERE IT FITS
 * -------------
 * `getSetting`/`setSetting` are plain synchronous reads/writes — usable from startup code and
 * the headless background task, not just React components. `useSetting` is the live-updating
 * hook version for a screen that needs to re-render when a setting changes.
 *
 * USED BY
 * -------
 * `src/db/migration-gate.tsx` (`crashReportingEnabled`, read once at startup),
 * `src/features/onboarding/*` (`onboardingDone`), `src/ui/permission-banner.tsx`
 * (dismiss timestamps), `src/stores/analytics-period.ts` (remembers the last period mode).
 *
 * IMPORTANT
 * ---------
 * `SettingKey` is a list of the keys the app currently knows about, purely for editor
 * autocomplete and to make the intent obvious at each call site — it's a soft suggestion, not a
 * hard constraint. `getSetting`/`setSetting`/`useSetting` all also accept an arbitrary string,
 * so nothing stops a new key being introduced elsewhere; if you add one, consider adding it to
 * this union too so it shows up for the next person.
 */

import { eq } from 'drizzle-orm';

import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { appSettings } from '../schema';

/** Known keys (§19.5). Free-form is still allowed; this is for autocomplete + intent. */
export type SettingKey =
  | 'onboardingDone'
  | 'smsBannerDismissedAt'
  | 'notifBannerDismissedAt'
  | 'crashReportingEnabled'
  | 'schemaSeededVersion'
  | 'lastPurgeAt'
  | 'analyticsPeriodMode'
  | 'smsLastRealtimeInvokedAt'
  | 'smsLastReconcileSweepAt'
  | 'smsLastReconcileMatchCount'
  | 'smsLastStoreTriggerAt'
  | 'smsCaughtBroadcast'
  | 'smsCaughtStoreTrigger'
  | 'smsCaughtSweepOpen'
  | 'smsCaughtSweepPeriodic'
  // V2 (CR-17/19)
  | 'splitYourName'
  | 'widgetHideAmounts'
  | 'widgetSnapshotAt'
  // CR-25
  | 'defaultCategoryId'
  | 'defaultIncomeCategoryId' // CR-28
  | 'installFirstOpenAt'
  | 'cardBillRemindersEnabled'; // CR-34 (§46.7) — default true

export function getSetting<T>(key: SettingKey | string, fallback: T): T {
  const row = db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: SettingKey | string, value: unknown): void {
  const now = Date.now();
  const json = JSON.stringify(value);
  db.insert(appSettings)
    .values({ key, value: json, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: json, updatedAt: now } })
    .run();
}

/**
 * Stamps `installFirstOpenAt` the first time this database ever exists — a no-op on every launch
 * after that (`onConflictDoNothing`, unlike `setSetting`'s upsert). A normal app *update* never
 * touches this: Android only wipes app data on an actual uninstall (or "Clear storage"), so an
 * existing install's row survives untouched and this stays a no-op for it. Only a genuinely fresh
 * database — a real reinstall — ever writes it. Read by `reconcileMissedSms`
 * (`src/services/tasks/sms-reconcile.ts`) so a fresh install's SMS reconciliation sweep can't
 * reach back further than this install has existed, even though the phone's SMS inbox itself
 * (unlike the app's database) survives a reinstall untouched.
 */
export function ensureInstallMarker(now: number = Date.now()): void {
  db.insert(appSettings)
    .values({ key: 'installFirstOpenAt', value: JSON.stringify(now), updatedAt: now })
    .onConflictDoNothing({ target: appSettings.key })
    .run();
}

/** Live single-key read for screens (returns `undefined` until the row exists). */
export function useSetting<T>(key: SettingKey | string) {
  const q = useLiveQuery(
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)),
  );
  let value: T | undefined;
  try {
    value = q.data[0] ? (JSON.parse(q.data[0].value) as T) : undefined;
  } catch {
    value = undefined;
  }
  return { ...q, value };
}
