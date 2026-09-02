/**
 * settingsRepo — SPEC-implementation.md §21.6 / §19.5. A tiny typed KV over `app_setting`.
 * Values are JSON-encoded. Sync reads are available to startup code and headless tasks.
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
  | 'analyticsPeriodMode';

export function getSetting<T>(key: SettingKey | string, fallback: T): T {
  const row = db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).get();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export const getSettingSync = getSetting;

export function setSetting(key: SettingKey | string, value: unknown): void {
  const now = Date.now();
  const json = JSON.stringify(value);
  db.insert(appSettings)
    .values({ key, value: json, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: json, updatedAt: now } })
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
